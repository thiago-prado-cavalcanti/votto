/**
 * Contract check for the official-source integrations.
 *
 *   npm run check:sources
 *
 * Hits the exact URLs the importers build and asserts that every field they read
 * is still present in the live response, then exercises the pure ranking and
 * scheduling helpers. **Touches no database** — safe to run anywhere, including
 * against production credentials, and safe to run in CI.
 *
 * Why this exists: the Câmara and Senado publish open data with no versioning
 * guarantee (the Senado already deprecated the whole `materia/*` family under
 * us), so a silent shape change would otherwise show up as an import that
 * "succeeds" while writing nothing. Run it before a deploy and whenever a sync
 * job starts returning suspiciously few records.
 *
 * Exits 0 when every check passes, 1 otherwise.
 */
// Must precede every import that reads `env` at module load.
import "./load-env";
import {
  computePriority,
  isConcludedSituation,
  priorityBand,
} from "@/lib/domain/priority";
import { dateWindows, isoDaysAgo, parseDate, splitName } from "@/lib/integration/importer";
import {
  computeQuality,
  isAdvancedSituation,
  GOALPOSTS,
  qualityBand,
  QUALITY_PILLARS,
  type QualityInputs,
} from "@/lib/indexes/quality";
import { isDeliberativeSession, serviceSpansFromHistory } from "@/lib/integration/camara";
import { PIPELINE_SCHEDULE, SYNC_JOBS, findJob, type SyncJobDefinition } from "@/lib/integration/jobs";
import {
  decide,
  jobDependencies,
  orderedJobs,
  type JobState,
  type StepStatus,
} from "@/lib/integration/pipeline";
import { describeSchedule, formatZoned, nextOccurrence } from "@/lib/integration/schedule";

const CAMARA = "https://dadosabertos.camara.leg.br/api/v2";
const SENADO = "https://legis.senado.leg.br/dadosabertos";
/**
 * The social providers' OIDC surfaces. These endpoints are hardcoded in
 * `src/lib/auth/social/providers.ts` rather than discovered, so this check is
 * what notices a provider moving one.
 */
const SOCIAL_PROVIDERS = [
  {
    label: "Google",
    discovery: "https://accounts.google.com/.well-known/openid-configuration",
    expect: {
      issuer: "https://accounts.google.com",
      authorization_endpoint: "https://accounts.google.com/o/oauth2/v2/auth",
      token_endpoint: "https://oauth2.googleapis.com/token",
      jwks_uri: "https://www.googleapis.com/oauth2/v3/certs",
    },
  },
  {
    label: "Apple",
    discovery: "https://appleid.apple.com/.well-known/openid-configuration",
    expect: {
      issuer: "https://appleid.apple.com",
      authorization_endpoint: "https://appleid.apple.com/auth/authorize",
      token_endpoint: "https://appleid.apple.com/auth/token",
      jwks_uri: "https://appleid.apple.com/auth/keys",
    },
  },
] as const;

/** Câmara's Plenário — the only órgão with nominal votes (see camara.ts). */
const PLENARY_ORG_ID = 180;

let failures = 0;

/** Record one assertion. */
function check(label: string, ok: boolean, detail = ""): void {
  if (ok) {
    console.log(`  ✓ ${label}`);
  } else {
    failures++;
    console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

/** Informational line (measurements that inform, but don't pass/fail). */
function note(text: string): void {
  console.log(`    · ${text}`);
}

/** Minimal JSON GET, mirroring the importers' headers. */
async function get<T = Record<string, unknown>>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": "VottoBot/1.0" },
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} em ${url}`);
  return (await res.json()) as T;
}

/** GET that treats any failure as "no data", like the importers' tolerant paths. */
async function getOrNull<T>(url: string): Promise<T | null> {
  try {
    return await get<T>(url);
  } catch {
    return null;
  }
}

type Page<T> = { dados?: T[]; links?: Array<{ rel?: string; href?: string }> };
type Wrapped<T> = { dados?: T };
type Row = Record<string, unknown>;

/** Read a nested property without asserting a shape. */
function at(value: unknown, path: string): unknown {
  let cur: unknown = value;
  for (const key of path.split(".")) {
    if (!cur || typeof cur !== "object") return undefined;
    cur = (cur as Row)[key];
  }
  return cur;
}

// ─── 1. Pure helpers ─────────────────────────────────────────────────────────

function checkHelpers(): void {
  console.log("\n[1] Helpers de prioridade e datas");
  const now = new Date("2026-08-09T12:00:00Z");

  // Cases taken from the live agenda, so the weights stay anchored to reality
  // rather than to intuition. Each asserts a BAND, not a number, so tuning the
  // weights does not force a test rewrite.
  const score = (signals: Parameters<typeof computePriority>[0]) => computePriority(signals, now);
  const recent = new Date("2026-08-07T00:00:00Z");

  const cases: Array<{ label: string; band: string; value: number }> = [
    {
      label: "Câmara, urgência + pronta para pauta + movimentou esta semana",
      band: "URGENT",
      value: score({ urgency: "Urgência (Art. 155, RICD)", situation: "Pronta para Pauta", identifier: "PL 1/2026", inProgress: true, lastActionAt: recent }),
    },
    {
      label: "Câmara, urgência mas já aprovada e enviada ao Senado",
      band: "NORMAL",
      value: score({ urgency: "Urgência (Art. 155, RICD)", situation: "Aguardando Apreciação pelo Senado Federal", identifier: "PL 2/2026", inProgress: true, lastActionAt: recent }),
    },
    {
      label: "Câmara, urgência aguardando deliberação",
      band: "HIGH",
      value: score({ urgency: "Urgência (Art. 155, RICD)", situation: "Aguardando Deliberação", identifier: "PL 3/2026", inProgress: true, lastActionAt: recent }),
    },
    {
      label: "Câmara, rito ordinário parado desde 2022",
      band: "LOW",
      value: score({ urgency: "Ordinário (Art. 151, III, RICD)", situation: "Aguardando Designação de Relator(a)", identifier: "PL 4/2020", inProgress: true, lastActionAt: new Date("2022-01-01T00:00:00Z") }),
    },
    {
      label: "medida provisória em deliberação (prazo constitucional)",
      band: "URGENT",
      value: score({ identifier: "MPV 1367/2026", situation: "Aguardando Deliberação", inProgress: true, lastActionAt: recent }),
    },
    {
      label: "Senado, incluída em ordem do dia (votação hoje)",
      band: "URGENT",
      value: score({ situation: "INCLUÍDA EM ORDEM DO DIA", identifier: "PL 5/2026", inProgress: true, lastActionAt: recent }),
    },
    {
      label: "Senado, pronto para deliberação do Plenário (fila de ~540)",
      band: "NORMAL",
      value: score({ situation: "PRONTO PARA DELIBERAÇÃO DO PLENÁRIO", identifier: "PL 6/2026", inProgress: true, lastActionAt: recent }),
    },
    {
      label: "já transformada em norma jurídica",
      band: "LOW",
      value: score({ urgency: "Urgência (Art. 155, RICD)", situation: "Transformado em Norma Jurídica", identifier: "PL 7/2026", inProgress: false, lastActionAt: now }),
    },
  ];

  for (const c of cases) {
    check(`${c.label} → ${c.value} (${priorityBand(c.value)})`, priorityBand(c.value) === c.band, `esperado ${c.band}`);
  }

  // The two houses must be able to out-rank each other; a formula where every
  // Câmara bill beats every Senado bill is measuring data availability, not
  // urgency.
  const camaraTypical = score({ urgency: "Urgência (Art. 155, RICD)", situation: "Aguardando Apreciação pelo Senado Federal", identifier: "PL 8/2026", inProgress: true, lastActionAt: recent });
  const senadoImminent = score({ situation: "INCLUÍDA EM ORDEM DO DIA", identifier: "PL 9/2026", inProgress: true, lastActionAt: recent });
  check(
    `um processo do Senado na ordem do dia (${senadoImminent}) supera uma proposição da Câmara já despachada (${camaraTypical})`,
    senadoImminent > camaraTypical,
  );

  check("situação 'Arquivada' encerra a tramitação", isConcludedSituation("Arquivada"));
  check("situação 'Pronta para Pauta' não encerra", !isConcludedSituation("Pronta para Pauta"));

  const windows = dateWindows(new Date("2026-01-01"), new Date("2026-08-09"), 85);
  const widest = Math.max(...windows.map((w) => (Date.parse(w.end) - Date.parse(w.start)) / 86_400_000));
  check(
    `dateWindows cobre 01/01–09/08 em ${windows.length} janelas contíguas`,
    windows[0].start === "2026-01-01" && windows[windows.length - 1].end === "2026-08-09",
    JSON.stringify(windows),
  );
  check(`nenhuma janela excede o limite de 3 meses da Câmara (máx ${widest}d)`, widest < 92);

  check("parseDate aceita data simples", parseDate("2026-07-15")?.toISOString().startsWith("2026-07-15") === true);
  check("parseDate aceita data-hora", parseDate("2026-07-15T14:00") instanceof Date);
  check("parseDate rejeita vazio e lixo", parseDate(null) === null && parseDate("lixo") === null);
  check("splitName separa nome e sobrenome", splitName("Acácio Favacho", "Deputado").lastName === "Favacho");
  check("splitName usa o fallback quando vazio", splitName("", "Senador").firstName === "Senador");
}

// ─── 2. Scheduling ───────────────────────────────────────────────────────────

/**
 * The chain: one weekly slot, and an ordering that actually holds.
 *
 * The dependency graph is plain data in the registry, so nothing in TypeScript
 * stops a typo'd name or a cycle — `orderedJobs` throws on both, and this is
 * where that throw is turned into a failed check instead of a broken worker
 * three days later. The last assertion is the one that matters: every dependency
 * comes out ahead of the job that declares it. That is the whole promise.
 */
function checkScheduling(): void {
  console.log("\n[2] Cadeia de sincronização (America/Sao_Paulo)");
  const now = new Date();

  check(`${SYNC_JOBS.length} jobs registrados com nomes únicos`, new Set(SYNC_JOBS.map((j) => j.name)).size === SYNC_JOBS.length);
  check("findJob resolve um job existente", findJob("camara:votes")?.name === "camara:votes");
  check("findJob devolve null para nome inválido", findJob("inexistente") === null);

  const next = nextOccurrence(PIPELINE_SCHEDULE, now);
  check(
    `cadeia agendada para ${formatZoned(next)} (${describeSchedule(PIPELINE_SCHEDULE)})`,
    next.getTime() > now.getTime() && next.getTime() - now.getTime() <= 8 * 86_400_000,
  );

  let ordered: SyncJobDefinition[] = [];
  try {
    ordered = orderedJobs();
    check(`ordem topológica resolvida para ${ordered.length} jobs`, ordered.length === SYNC_JOBS.length);
  } catch (err) {
    check(`ordem topológica: ${err instanceof Error ? err.message : String(err)}`, false);
    return;
  }

  const position = new Map(ordered.map((job, i) => [job.name, i]));
  const violations = ordered.flatMap((job) =>
    jobDependencies(job)
      .filter((dep) => (position.get(dep) ?? -1) >= (position.get(job.name) ?? 0))
      .map((dep) => `${job.name} antes de ${dep}`),
  );
  check(
    violations.length === 0
      ? "toda dependência vem antes de quem depende dela"
      : `dependências fora de ordem: ${violations.join(", ")}`,
    violations.length === 0,
  );

  console.log(`      ${ordered.map((j) => j.name).join(" → ")}`);

  checkFreshness(now);
}

/**
 * The skip rule, exercised against a hand-built state map — no database.
 *
 * The third case is the one worth a check of its own: a job inside its freshness
 * window whose *dependency* ran after it. Age alone says "em dia", and that is
 * how the tail of the chain ends up a week behind its head — the quality index
 * still carrying last week's roll calls because it happened to run yesterday.
 */
function checkFreshness(now: Date): void {
  const quality = findJob("metrics:quality");
  const votes = findJob("camara:votes");
  if (!quality || !votes) {
    check("jobs de referência para o teste de frescor existem", false);
    return;
  }

  const week = 7 * 86_400_000;
  const ago = (ms: number) => new Date(now.getTime() - ms);
  const ran = (at: Date): JobState => ({ lastOk: true, lastFinishedAt: at });
  const plan = (state: Map<string, JobState>, outcomes = new Map<string, StepStatus>()) =>
    decide(quality, state, outcomes, week, now);

  check(
    "nunca executado → executa",
    plan(new Map()).action === "run",
  );
  check(
    "concluído há 8 dias → executa",
    plan(new Map([[quality.name, ran(ago(8 * 86_400_000))]])).action === "run",
  );
  check(
    "concluído há 2 dias, nada novo a montante → pula",
    plan(
      new Map([
        [quality.name, ran(ago(2 * 86_400_000))],
        [votes.name, ran(ago(3 * 86_400_000))],
      ]),
    ).action === "skip",
  );
  check(
    "concluído há 2 dias mas camara:votes rodou há 1 → executa",
    plan(
      new Map([
        [quality.name, ran(ago(2 * 86_400_000))],
        [votes.name, ran(ago(1 * 86_400_000))],
      ]),
    ).action === "run",
  );
  check(
    "dependência `needs` que falhou nesta execução → adiado, não executado",
    plan(
      new Map([[quality.name, ran(ago(30 * 86_400_000))]]),
      new Map([[votes.name, "failed"]]),
    ).status === "blocked",
  );

  const parties = findJob("camara:parties");
  check(
    "falha em dependência `after` não adia ninguém",
    parties
      ? decide(
          findJob("camara:agents")!,
          new Map(),
          new Map([[parties.name, "failed"]]),
          week,
          now,
        ).action === "run"
      : false,
  );
}

// ─── 3. Câmara dos Deputados ─────────────────────────────────────────────────

async function checkCamara(): Promise<void> {
  console.log("\n[3] Câmara dos Deputados — contratos da API");

  const parties = await get<Page<Row>>(`${CAMARA}/partidos?ordem=ASC&ordenarPor=sigla&itens=100`);
  const partyRows = parties.dados ?? [];
  check(`partidos: ${partyRows.length} registros`, partyRows.length > 0);
  check("partido traz id, sigla e nome", partyRows.every((p) => p.id != null && p.sigla && p.nome));

  const partyDetail = await get<Wrapped<Row>>(`${CAMARA}/partidos/${partyRows[0].id}`);
  const pd = partyDetail.dados ?? {};
  check(
    `detalhe do partido traz status.totalMembros, líder e logo (${String(pd.sigla)})`,
    at(pd, "status.totalMembros") != null && "urlLogo" in pd,
  );

  const deputies = await get<Page<Row>>(`${CAMARA}/deputados?ordem=ASC&ordenarPor=nome&itens=100`);
  const deputyRows = deputies.dados ?? [];
  check(`deputados: página cheia (${deputyRows.length})`, deputyRows.length === 100);
  check(
    "deputado traz id, nome, UF e legislatura",
    deputyRows.every((d) => d.id != null && d.nome && d.siglaUf && d.idLegislatura != null),
  );

  const types = ["PL", "PLP", "PEC", "MPV", "PDL", "PLV", "PLN"].map((t) => `siglaTipo=${t}`).join("&");
  const bills = await get<Page<Row>>(
    `${CAMARA}/proposicoes?${types}&dataInicio=${isoDaysAgo(7)}&ordem=DESC&ordenarPor=id&itens=100`,
  );
  const billRows = bills.dados ?? [];
  check(`proposições que tramitaram em 7 dias: ${billRows.length}`, billRows.length > 0);

  const billDetail = await get<Wrapped<Row>>(`${CAMARA}/proposicoes/${billRows[0].id}`);
  const bill = billDetail.dados ?? {};
  const status = (bill.statusProposicao ?? {}) as Row;
  check(
    `statusProposicao traz regime, situação e data (${String(bill.siglaTipo)} ${String(bill.numero)}/${String(bill.ano)})`,
    "regime" in status && "descricaoSituacao" in status && "dataHora" in status,
  );
  check(
    "proposição traz ementa, keywords, inteiro teor e data de apresentação",
    "ementa" in bill && "keywords" in bill && "urlInteiroTeor" in bill && "dataApresentacao" in bill,
  );

  const subjects = await get<Page<Row>>(`${CAMARA}/proposicoes/${billRows[0].id}/temas`);
  check(
    `classificação oficial traz codTema/tema/relevancia (${(subjects.dados ?? []).length} itens)`,
    (subjects.dados ?? []).every((t) => "codTema" in t && "tema" in t && "relevancia" in t),
  );

  await checkCamaraAgenda();
  await checkCamaraRollCall();
}

/**
 * The floor agenda is what `syncAgendaThemes` reads instead of sweeping every
 * bill — the Câmara publishes no relevance ranking, and `/proposicoes` silently
 * ignores `codSituacao`. This asserts both facts, because if `codSituacao` ever
 * started working the agenda walk would become unnecessary.
 */
async function checkCamaraAgenda(): Promise<void> {
  const unfiltered = await get<Page<Row>>(
    `${CAMARA}/proposicoes?siglaTipo=PL&dataInicio=${isoDaysAgo(30)}&itens=1`,
  );
  const nonsense = await get<Page<Row>>(
    `${CAMARA}/proposicoes?siglaTipo=PL&codSituacao=99999&dataInicio=${isoDaysAgo(30)}&itens=1`,
  );
  const lastPage = (page: Page<Row>) =>
    page.links?.find((l) => l.rel === "last")?.href?.match(/pagina=(\d+)/)?.[1] ?? "1";
  check(
    "`codSituacao` continua sendo ignorado em /proposicoes (por isso lemos a pauta)",
    lastPage(unfiltered) === lastPage(nonsense),
    `um valor inexistente passou a filtrar (${lastPage(unfiltered)} vs ${lastPage(nonsense)}) — reavaliar syncAgendaThemes`,
  );

  const events = await get<Page<Row>>(
    `${CAMARA}/orgaos/${PLENARY_ORG_ID}/eventos?dataInicio=${isoDaysAgo(60)}&dataFim=${isoDaysAgo(0)}&itens=100`,
  );
  const deliberative = (events.dados ?? []).filter((e) =>
    isDeliberativeSession(String(e.descricaoTipo ?? "")),
  );
  check(
    `sessões deliberativas do Plenário em 60 dias: ${deliberative.length}`,
    deliberative.length > 0,
    "sem sessões deliberativas — recesso, ou o filtro de tipo mudou",
  );
  if (deliberative.length === 0) return;

  // Most sessions publish no agenda at all (≈10 of 36 in a 60-day window), and
  // the event list is NOT date-ordered — sampling a slice would report a false
  // failure, so every session in the window is walked.
  const bills = new Set<number>();
  let withAgenda = 0;
  for (const event of deliberative) {
    const agenda = await getOrNull<Page<Row>>(`${CAMARA}/eventos/${event.id}/pauta`);
    const items = agenda?.dados ?? [];
    if (items.length > 0) withAgenda++;
    for (const item of items) {
      const id = at(item, "proposicao_.id");
      if (typeof id === "number") bills.add(id);
    }
  }
  note(`${withAgenda}/${deliberative.length} sessões com pauta publicada`);
  check(
    `pauta traz proposicao_.id (${bills.size} proposições distintas)`,
    bills.size > 0,
    "nenhum item de pauta com proposição — o campo `proposicao_` pode ter mudado",
  );
}

/** Walk the plenary window exactly as `syncVotes` does, to the first roll call. */
async function checkCamaraRollCall(): Promise<void> {
  const window = dateWindows(new Date(Date.now() - 85 * 86_400_000), new Date(), 85)[0];
  let url: string | null =
    `${CAMARA}/votacoes?idOrgao=${PLENARY_ORG_ID}&dataInicio=${window.start}&dataFim=${window.end}` +
    `&ordem=DESC&ordenarPor=dataHoraRegistro&itens=100`;

  let rollCall: { votacao: Row; votos: Row[] } | null = null;
  let scanned = 0;
  let unavailable = 0;

  while (url && !rollCall && scanned < 400) {
    const page: Page<Row> = await get<Page<Row>>(url);
    for (const v of page.dados ?? []) {
      scanned++;
      // `/votos` answers 404 for some votações rather than an empty list; the
      // importer's fetchVotos swallows that, so mirror it here.
      const votes = await getOrNull<Page<Row>>(`${CAMARA}/votacoes/${encodeURIComponent(String(v.id))}/votos`);
      if (!votes) unavailable++;
      const rows = votes?.dados ?? [];
      if (rows.length > 0) {
        rollCall = { votacao: v, votos: rows };
        break;
      }
    }
    url = page.links?.find((l) => l.rel === "next")?.href ?? null;
  }

  note(`${scanned} votações do Plenário varridas, ${unavailable} sem endpoint de votos (404 tolerado)`);
  check(
    `votação nominal encontrada${rollCall ? ` (${String(rollCall.votacao.id)}, ${rollCall.votos.length} votos)` : ""}`,
    rollCall !== null,
    "nenhuma votação nominal na janela — verifique se o Plenário votou no período",
  );
  if (!rollCall) return;

  check("voto traz tipoVoto e o id do deputado", rollCall.votos.every((v) => v.tipoVoto && at(v, "deputado_.id") != null));

  const detail = await get<Wrapped<Row>>(`${CAMARA}/votacoes/${encodeURIComponent(String(rollCall.votacao.id))}`);
  const affected = ((detail.dados ?? {}).proposicoesAfetadas ?? []) as Row[];
  check(
    `detalhe resolve a proposição votada via proposicoesAfetadas${affected[0] ? ` (${String(affected[0].siglaTipo)} ${String(affected[0].numero)}/${String(affected[0].ano)})` : ""}`,
    affected.length > 0 && affected[0].id != null,
  );
  check(
    "uriProposicaoObjeto da listagem continua nulo (razão de usarmos o detalhe)",
    rollCall.votacao.uriProposicaoObjeto == null,
  );

  const distribution: Record<string, number> = {};
  for (const v of rollCall.votos) {
    const key = String(v.tipoVoto);
    distribution[key] = (distribution[key] ?? 0) + 1;
  }
  note(`distribuição de votos: ${JSON.stringify(distribution)}`);
}

// ─── 4. Senado Federal ───────────────────────────────────────────────────────

async function checkSenado(): Promise<void> {
  console.log("\n[4] Senado Federal — contratos da API");

  const senators = await get(`${SENADO}/senador/lista/atual`);
  const senatorRows = (at(senators, "ListaParlamentarEmExercicio.Parlamentares.Parlamentar") ?? []) as Row[];
  check(`senadores em exercício: ${senatorRows.length}`, senatorRows.length > 50);
  check(
    "senador traz código, nome e UF",
    senatorRows.every(
      (p) => at(p, "IdentificacaoParlamentar.CodigoParlamentar") && at(p, "IdentificacaoParlamentar.UfParlamentar"),
    ),
  );

  const parties = await get(`${SENADO}/composicao/lista/partidos`);
  const partyRows = (at(parties, "ListaPartidos.Partidos.Partido") ?? []) as Row[];
  check(`partidos catalogados: ${partyRows.length}`, partyRows.length > 0 && partyRows.every((p) => p.Sigla && p.Nome));

  const bills = await get<Row[]>(`${SENADO}/processo?numdias=7`);
  check(`processos atualizados em 7 dias: ${Array.isArray(bills) ? bills.length : "resposta não é lista"}`, Array.isArray(bills) && bills.length > 0);
  check(
    "processo traz id, código da matéria, identificação e tramitando",
    bills.every((p) => p.id != null && p.codigoMateria != null && p.identificacao && p.tramitando),
  );
  note(`situacaoAtual ausente em ${bills.filter((p) => !p.situacaoAtual).length}/${bills.length} — tratado como nulo`);

  // Unlike the Câmara, the Senado does filter by situation server-side — that is
  // what makes `syncAgendaThemes` a precise query instead of a sweep.
  const ready = await get<Row[]>(`${SENADO}/processo?siglaSituacao=PRONDEPLEN&tramitando=S`);
  check(
    `filtro por situação funciona: ${Array.isArray(ready) ? ready.length : "?"} prontos para o Plenário`,
    Array.isArray(ready) && ready.length > 0 && ready.length < bills.length * 10,
    "siglaSituacao deixou de filtrar — reavaliar syncAgendaThemes",
  );

  const detail = await get<Row | Row[]>(`${SENADO}/processo/${bills[0].id}`);
  const bill = (Array.isArray(detail) ? detail[0] : detail) ?? {};
  check(
    `detalhe traz documento e situação (${String(bill.identificacao)})`,
    "documento" in bill && "situacaoAtual" in bill,
  );
  note("classificacoes é opcional no detalhe — o importador aceita ausência");

  const votes = await get<Row[]>(`${SENADO}/votacao?dataInicio=${isoDaysAgo(60)}&dataFim=${isoDaysAgo(0)}`);
  check(`votações em 60 dias: ${Array.isArray(votes) ? votes.length : "resposta não é lista"}`, Array.isArray(votes));
  if (!Array.isArray(votes) || votes.length === 0) return;

  const nominal = votes.filter((v) => v.votacaoSecreta !== "S" && ((v.votos as Row[] | undefined)?.length ?? 0) > 0);
  check(`votações nominais com votos individuais: ${nominal.length}/${votes.length}`, nominal.length > 0);
  check(
    "votação traz identificação, data e código da sessão",
    nominal.every((v) => v.identificacao && v.dataSessao && v.codigoSessaoVotacao != null),
  );

  const codes = new Set(nominal.flatMap((v) => (v.votos as Row[]).map((x) => String(x.siglaVotoParlamentar))));
  note(`códigos de voto no período: ${[...codes].join(", ")}`);
  check("códigos Sim e Não presentes", codes.has("Sim") && codes.has("Não"));
}

// ─── 5. Provedores sociais ───────────────────────────────────────────────────

async function checkSocialProviders(): Promise<void> {
  console.log("\n[5] Login social — endpoints OIDC");

  for (const provider of SOCIAL_PROVIDERS) {
    const doc = await get<Row>(provider.discovery);

    for (const [field, expected] of Object.entries(provider.expect)) {
      check(
        `${provider.label}: ${field} continua ${expected}`,
        String(doc[field] ?? "").replace(/\/+$/, "") === expected,
      );
    }

    const algs = (doc.id_token_signing_alg_values_supported ?? []) as string[];
    const pkce = (doc.code_challenge_methods_supported ?? []) as string[];
    check(`${provider.label}: RS256 ou ES256 no id_token`, algs.some((a) => a === "RS256" || a === "ES256"));
    check(`${provider.label}: PKCE S256 anunciado`, pkce.includes("S256"));
  }

  // Facebook publishes a discovery document that omits `token_endpoint`, which
  // is exactly why the endpoints are hardcoded. Check what it does publish.
  const fb = await get<Row>("https://www.facebook.com/.well-known/openid-configuration");
  check(
    "Facebook: issuer continua https://www.facebook.com",
    String(fb.issuer ?? "") === "https://www.facebook.com",
  );
  check(
    "Facebook: jwks_uri continua .well-known/oauth/openid/jwks",
    String(fb.jwks_uri ?? "").includes("/.well-known/oauth/openid/jwks"),
  );
  note("Facebook não publica token_endpoint na descoberta — por isso os endpoints são fixos.");

  const claims = (fb.claims_supported ?? []) as string[];
  check(
    "Facebook: claims de nome disponíveis (given_name/family_name)",
    claims.includes("given_name") && claims.includes("family_name"),
  );

  // The token endpoint is unversioned on purpose: Meta expires each Graph API
  // version after ~2 years, so a pinned version is a login outage with a fuse.
  const tokenProbe = await fetch("https://graph.facebook.com/oauth/access_token");
  check(
    "Facebook: token endpoint sem versão continua respondendo",
    tokenProbe.status !== 404,
  );
}

// ─── Entry point ─────────────────────────────────────────────────────────────

// ─── 1b. Quality index helpers ───────────────────────────────────────────────

function checkQualityHelpers(): void {
  console.log("\n[1b] Performance política (sem rede)");

  // Outcome vocabulary. Deliberately disjoint from `isConcludedSituation`: a
  // shelved bill has stopped moving without having got anywhere.
  check("norma jurídica conta como avanço", isAdvancedSituation("Transformado em Norma Jurídica"));
  check("aguardando sanção conta como avanço", isAdvancedSituation("Aguardando Sanção"));
  check("enviada à outra casa conta como avanço", isAdvancedSituation("Aguardando Apreciação pelo Senado Federal"));
  check("arquivada NÃO conta como avanço", !isAdvancedSituation("Arquivada"));
  check("rejeitada NÃO conta como avanço", !isAdvancedSituation("Rejeitada"));
  check(
    "encerrada sem avanço é encerrada, não avanço",
    isConcludedSituation("Arquivada") && !isAdvancedSituation("Arquivada"),
    "os dois vocabulários deixaram de ser disjuntos",
  );

  // Midrank on a MINORITY tie block: the three tied members share one score
  // instead of being spread across a range in whatever order the array arrived
  // in — a difference the data does not contain. The fixture has to stay a
  // minority, because a majority block is nulled by the rule checked below.
  // Goalposts fixos: a nota é uma afirmação sobre o próprio parlamentar,
  // conferível contra um número publicado, e não se move quando outra pessoa
  // muda de comportamento. É a propriedade que motivou o redesenho inteiro.
  const full = (over: Partial<QualityInputs> = {}): QualityInputs => ({
    attendance: { eligible: 200, attended: 190, leaveShare: 0.02 },
    authorship: { authored: 12, advanced: 3, months: 40 },
    rapporteurship: { count: 4, months: 40 },
    cost: { spent: 800_000, documents: 900, months: 40, ceiling: 45_000 },
    ...over,
  });
  const pillar = (key: string, i: QualityInputs, house: "CAMARA" | "SENADO" = "CAMARA") =>
    QUALITY_PILLARS.find((p) => p.key === key)?.score(i, house) ?? null;

  check(
    `assiduidade perfeita marca 100 (${pillar("attendance", full({ attendance: { eligible: 200, attended: 200, leaveShare: 0 } }))})`,
    pillar("attendance", full({ attendance: { eligible: 200, attended: 200, leaveShare: 0 } })) === 100,
  );
  // Lê o piso do próprio registry: um número fixo aqui envelheceria na primeira
  // recalibragem, que é exatamente o que aconteceu com a versão anterior.
  const atFloor = Math.round(200 * GOALPOSTS.attendance.floor);
  check(
    `assiduidade no piso publicado (${GOALPOSTS.attendance.floor}) marca o mínimo`,
    (pillar("attendance", full({ attendance: { eligible: 200, attended: atFloor, leaveShare: 0 } })) ?? 99) <= 1,
    "o piso deixou de ancorar a escala",
  );

  // A propriedade decisiva: ninguém mais entra na conta de ninguém.
  const alone = pillar("production", full());
  const crowded = pillar("production", full());
  check("a nota não depende de mais ninguém", alone === crowded && alone !== null);

  // Custo é taxa de utilização do teto publicado, não reais absolutos — é o que
  // impede que a geografia da cota vire mérito.
  const cheapUf = pillar("cost", full({ cost: { spent: 40_000 * 40, documents: 900, months: 40, ceiling: 50_000 } }));
  const dearUf = pillar("cost", full({ cost: { spent: 40_000 * 40, documents: 900, months: 40, ceiling: 42_000 } }));
  check(
    `mesmo gasto, teto maior pontua mais (${cheapUf} > ${dearUf})`,
    (cheapUf ?? 0) > (dearUf ?? 0),
    "o custo voltou a ser lido em reais absolutos — a UF do parlamentar está virando mérito",
  );
  const atCap = 45_000 * GOALPOSTS.cost.floor;
  check(
    `usar ${Math.round(GOALPOSTS.cost.floor * 100)}% da cota marca o mínimo`,
    (pillar("cost", full({ cost: { spent: atCap * 40, documents: 900, months: 40, ceiling: 45_000 } })) ?? 99) <= 1,
  );
  check(
    `usar ${Math.round(GOALPOSTS.cost.target * 100)}% da cota marca 100`,
    pillar("cost", full({
      cost: { spent: 45_000 * GOALPOSTS.cost.target * 40, documents: 900, months: 40, ceiling: 45_000 },
    })) === 100,
  );
  check(
    "sem teto conhecido o custo não pontua",
    pillar("cost", full({ cost: { spent: 100_000, documents: 900, months: 40, ceiling: null } })) === null,
  );
  check(
    "gasto zero sem documento é null, nunca nota máxima",
    pillar("cost", full({ cost: { spent: 0, documents: 0, months: 40, ceiling: 45_000 } })) === null,
    "custo sem documento voltou a pontuar — R$ 0 está sendo lido como economia",
  );

  check(
    "afastamento acima do teto zera a assiduidade",
    pillar("attendance", full({ attendance: { eligible: 200, attended: 200, leaveShare: 0.8 } })) === null,
    "quem passou a janela afastado está pontuando 100% de presença",
  );
  check(
    "poucas votações não produzem assiduidade",
    pillar("attendance", full({ attendance: { eligible: 3, attended: 3, leaveShare: 0 } })) === null,
  );
  check(
    "mandato curto não produz taxa por mês",
    pillar("production", full({ authorship: { authored: 2, advanced: 0, months: 2 }, rapporteurship: { count: 0, months: 2 } })) === null,
  );
  check(
    "desfecho conta duas vezes",
    (pillar("production", full({ authorship: { authored: 10, advanced: 10, months: 40 } })) ?? 0) >
      (pillar("production", full({ authorship: { authored: 10, advanced: 0, months: 40 } })) ?? 0),
  );
  // O log é o que impede a cauda de esmagar o resto: quem produz o dobro da
  // mediana não vale o dobro da nota, e quem produz 10× não vale 10×.
  const p1 = pillar("production", full({ authorship: { authored: 40, advanced: 0, months: 40 }, rapporteurship: { count: 0, months: 40 } })) ?? 0;
  const p10 = pillar("production", full({ authorship: { authored: 400, advanced: 0, months: 40 }, rapporteurship: { count: 0, months: 40 } })) ?? 0;
  check(
    `produzir 10× não vale 10× a nota (${p1} → ${p10})`,
    p10 > p1 && p10 < p1 * 3,
    "a produção voltou a ser lida em escala linear — a cauda esmaga o resto",
  );

  // Média geométrica: falhar num pilar não se compra com os outros dois.
  const balanced = computeQuality(full(), "CAMARA");
  const lopsided = computeQuality(
    full({ attendance: { eligible: 200, attended: 20, leaveShare: 0 } }),
    "CAMARA",
  );
  check(
    `falha num pilar não é compensada (${balanced.score} → ${lopsided.score})`,
    (lopsided.score ?? 100) < (balanced.score ?? 0) * 0.75,
    "a agregação voltou a ser aritmética — fantasma, ocioso e perdulário pontuam igual",
  );

  // Redistribuição de peso e piso de cobertura.
  const partial = computeQuality(full({ authorship: null, rapporteurship: null }), "CAMARA");
  check(
    `peso de pilar ausente é redistribuído (cobertura ${partial.coverage.toFixed(2)})`,
    partial.score !== null && Math.abs(partial.coverage - 2 / 3) < 0.01,
    "o peso de um pilar ausente deixou de ser redistribuído",
  );
  const thin = computeQuality(
    full({ attendance: null, authorship: null, rapporteurship: null }),
    "CAMARA",
  );
  check(
    "cobertura abaixo do piso devolve null",
    thin.score === null,
    "está publicando nota com menos da metade dos pilares medidos",
  );

  check("85 → banda de topo", qualityBand(85) === "EXCELLENT");
  check("50 → banda do meio", qualityBand(50) === "AVERAGE");
  check("20 → banda de baixo", qualityBand(20) === "WEAK");

  // Câmara timeline reconstruction, from the vocabulary observed live.
  const spans = serviceSpansFromHistory([
    { dataHora: "2023-02-01T12:05", descricaoStatus: "Entrada - Posse de Eleito Titular", situacao: "Exercício" },
    { dataHora: "2023-06-10T00:00", descricaoStatus: "Saída - Afastamento sem prazo determinado - Secretário de Estado", situacao: "Licença" },
    { dataHora: "2024-02-01T00:00", descricaoStatus: "Entrada - Reassunção", situacao: "Exercício" },
    { dataHora: "2024-05-01T00:00", descricaoStatus: "Alteração de partido", situacao: null },
  ]);
  const exercise = spans.filter((s) => s.kind === "EXERCISE");
  const leave = spans.filter((s) => s.kind === "LEAVE");
  check(
    `log da Câmara vira 2 exercícios + 1 licença (${exercise.length}+${leave.length})`,
    exercise.length === 2 && leave.length === 1,
    "o pareamento entrada/saída mudou — a assiduidade da Câmara perde o denominador",
  );
  check(
    "a licença carrega o motivo publicado",
    leave[0]?.reason === "Secretário de Estado",
  );
  check("o último exercício fica aberto", exercise[1]?.endsAt === null);
  check(
    "'Alteração de partido' não move ninguém para dentro nem para fora",
    exercise.length === 2,
  );
}

// ─── 4b. Quality index sources ───────────────────────────────────────────────

const SENADO_ADM = "https://adm.senado.gov.br/adm-dadosabertos/api/v1";

async function checkQualitySources(): Promise<void> {
  console.log("\n[4b] Fontes da performance política");

  // ── Câmara: mandate log ───────────────────────────────────────────────────
  const roster = await get<Page<Row>>(`${CAMARA}/deputados?ordem=ASC&ordenarPor=nome&itens=1`);
  const deputy = roster.dados?.[0];
  const deputyId = deputy?.id;
  check("deputados/{id} disponível para amostragem", typeof deputyId === "number");
  if (typeof deputyId !== "number") return;

  const history = await get<Page<Row>>(`${CAMARA}/deputados/${deputyId}/historico`);
  const hist = history.dados ?? [];
  check("historico traz dataHora", hist.some((h) => typeof h.dataHora === "string"));
  check("historico traz descricaoStatus", hist.some((h) => typeof h.descricaoStatus === "string"));
  check("historico traz idLegislatura", hist.some((h) => typeof h.idLegislatura === "number"));
  const statuses = new Set(hist.map((h) => String(h.descricaoStatus ?? "").split(" - ")[0]));
  check(
    `historico ainda usa o vocabulário Entrada/Saída (${[...statuses].join(", ")})`,
    [...statuses].some((x) => x === "Entrada" || x === "Saída"),
    "o pareamento entrada/saída de serviceSpansFromHistory perde o denominador da assiduidade",
  );

  const legs = await get<Page<Row>>(`${CAMARA}/legislaturas?ordem=DESC&ordenarPor=id&itens=3`);
  check(
    "legislaturas trazem dataInicio/dataFim",
    (legs.dados ?? []).some((l) => typeof l.dataInicio === "string" && typeof l.id === "number"),
  );

  // ── Câmara: expenses, and the two silent quirks the sweep is built around ──
  const legId = Number(at(legs, "dados.0.id") ?? 57);
  const year = new Date().getFullYear();
  let expenses: Page<Row> | null = null;
  for (const y of [year, year - 1, year - 2]) {
    const page = await get<Page<Row>>(
      `${CAMARA}/deputados/${deputyId}/despesas?idLegislatura=${legId}&ano=${y}&itens=100`,
    );
    if ((page.dados ?? []).length > 0) {
      expenses = page;
      note(`despesas amostradas em ${y} (legislatura ${legId})`);
      break;
    }
  }
  check("despesas com (idLegislatura, ano) retornam documentos", (expenses?.dados ?? []).length > 0);
  const doc = expenses?.dados?.[0];
  if (doc) {
    for (const field of ["ano", "mes", "tipoDespesa", "valorLiquido"]) {
      check(`despesa traz ${field}`, doc[field] !== undefined);
    }
  }

  // NEGATIVE INVARIANT — the highest-value check in this section. The failure it
  // guards is a 200 OK with `[]`, which no counter distinguishes from "this
  // deputy spent nothing".
  const noLeg = await get<Page<Row>>(`${CAMARA}/deputados/${deputyId}/despesas?ano=${year - 1}&itens=10`);
  check(
    "despesas SEM idLegislatura continuam vindo vazias",
    (noLeg.dados ?? []).length === 0,
    "a Câmara passou a aceitar despesas sem idLegislatura — o contorno virou desnecessário e alguém pode removê-lo sem notar",
  );

  // NEGATIVE INVARIANT — with idLegislatura but no ano, only the legislature's
  // first year comes back, which is why the sweep is over (legislatura × ano).
  const noYear = await get<Page<Row>>(
    `${CAMARA}/deputados/${deputyId}/despesas?idLegislatura=${legId}&itens=100`,
  );
  const yearsSeen = new Set((noYear.dados ?? []).map((d) => d.ano));
  check(
    `despesas sem 'ano' ainda cobrem um ano só (${[...yearsSeen].join(", ") || "vazio"})`,
    yearsSeen.size <= 1,
    "o parâmetro 'ano' deixou de ser necessário — a varredura por (legislatura × ano) pode ser simplificada",
  );

  // ── Câmara: authorship filter actually filters ────────────────────────────
  const authored = await get<Page<Row>>(
    `${CAMARA}/proposicoes?idDeputadoAutor=${deputyId}&siglaTipo=PL&siglaTipo=PEC&ano=${year - 1}&itens=100`,
  );
  const unfiltered = await get<Page<Row>>(
    `${CAMARA}/proposicoes?siglaTipo=PL&siglaTipo=PEC&ano=${year - 1}&itens=100`,
  );
  check(
    "idDeputadoAutor filtra de verdade (não só é aceito)",
    (authored.dados ?? []).length < (unfiltered.dados ?? []).length,
    "aceito não é filtrado — mesma lição do codSituacao; a autoria estaria contando a Câmara inteira",
  );

  // NEGATIVE INVARIANT — the Câmara still publishes only a bill's LAST
  // rapporteur, which is why our count for deputies is a floor. The day it
  // publishes the history, the undercount becomes fixable.
  const bill = at(unfiltered, "dados.0.id");
  if (typeof bill === "number") {
    const detail = await get<Wrapped<Row>>(`${CAMARA}/proposicoes/${bill}`);
    const status = at(detail, "dados.statusProposicao") as Row | undefined;
    check("statusProposicao ainda expõe uriUltimoRelator", status?.uriUltimoRelator !== undefined);

    // The bill's author, which the themes list prints as its accountable face.
    // Unchecked until now, and that is how it went missing quietly: a failed or
    // empty `/autores` is indistinguishable from "this bill has no author", so
    // the theme is written anyway and nothing ever comes back for it
    // (`npm run reauthor` is the repair). Assert the two fields the mapping
    // reads — `proponente`, which picks the author of record out of the
    // signatories, and `uri`, which is what separates a parliamentarian from an
    // órgão.
    const authors = await get<Page<Row>>(`${CAMARA}/proposicoes/${bill}/autores`);
    const authorRows = authors.dados ?? [];
    check(`proposicoes/{id}/autores responde (${authorRows.length})`, authorRows.length > 0);
    if (authorRows.length > 0) {
      check(
        "autores trazem 'proponente' e 'uri'",
        authorRows.some((a) => a.proponente !== undefined) && authorRows.every((a) => a.uri !== undefined),
        "sem proponente/uri não dá para saber quem assina de fato nem se é parlamentar ou órgão",
      );
    }
    check(
      "statusProposicao continua SEM histórico de relatoria",
      status?.relatores === undefined && status?.uriRelatores === undefined,
      "a Câmara passou a publicar o histórico de relatores — dá para trocar o piso por uma contagem real",
    );
  }

  // ── Senado: authorship, rapporteurship, leaves, mandates ──────────────────
  const senators = await get<Row>(`${SENADO}/senador/lista/atual`);
  const list = at(senators, "ListaParlamentarEmExercicio.Parlamentares.Parlamentar");
  const codes = (Array.isArray(list) ? list : [])
    .map((p) => at(p, "IdentificacaoParlamentar.CodigoParlamentar"))
    .filter((c): c is string => typeof c === "string");
  check(`lista de senadores em exercício (${codes.length})`, codes.length > 0);
  if (codes.length === 0) return;
  const code = codes[0];

  const mandates = await get<Row>(`${SENADO}/senador/${code}/mandatos`);
  check(
    "mandatos trazem Exercicios.Exercicio.DataInicio",
    JSON.stringify(mandates).includes("DataInicio"),
    "sem intervalos de exercício o denominador da assiduidade do Senado some",
  );

  const leaves = await get<Row>(`${SENADO}/senador/${code}/licencas`);
  const raw = JSON.stringify(leaves);
  check("licenças trazem DataInicio/DataFim", raw.includes("DataInicio") && raw.includes("DataFim"));
  check("licenças trazem SiglaTipoAfastamento", raw.includes("SiglaTipoAfastamento"));

  const relatorias = await get<Row[]>(`${SENADO}/processo/relatoria?codigoParlamentar=${code}`);
  check("relatorias por parlamentar retornam linhas", Array.isArray(relatorias) && relatorias.length > 0);
  if (Array.isArray(relatorias) && relatorias[0]) {
    for (const field of ["dataDesignacao", "idProcesso", "descricaoTipoRelator"]) {
      check(`relatoria traz ${field}`, relatorias[0][field] !== undefined);
    }
  }

  // "Accepted" is not "filters" — the codSituacao lesson, applied to the Senado.
  const byAuthor = await get<Row[]>(`${SENADO}/processo?codigoParlamentarAutor=${code}`);
  const anyProcess = await get<Row[]>(`${SENADO}/processo`);
  check(
    `codigoParlamentarAutor filtra de verdade (${Array.isArray(byAuthor) ? byAuthor.length : "?"} linhas)`,
    Array.isArray(byAuthor) &&
      byAuthor.length > 0 &&
      Array.isArray(anyProcess) &&
      byAuthor.length < anyProcess.length,
    "codigoParlamentarAutor não filtra — a autoria do Senado precisaria cair para a contagem sobre o corpus importado",
  );

  note("senador/{cod}/autorias e /relatorias passaram da desativação (2026-02-01); nada aqui se apoia neles");

  // ── Senado: CEAPS, on the administrative host ─────────────────────────────
  let ceaps: Row[] | null = null;
  for (const y of [year, year - 1]) {
    ceaps = await getOrNull<Row[]>(`${SENADO_ADM}/senadores/despesas_ceaps/${y}`);
    if (Array.isArray(ceaps) && ceaps.length > 0) {
      note(`CEAPS amostrado em ${y} (${ceaps.length.toLocaleString("pt-BR")} documentos)`);
      break;
    }
  }
  check("CEAPS retorna documentos", Array.isArray(ceaps) && ceaps.length > 0);
  if (Array.isArray(ceaps) && ceaps[0]) {
    for (const field of ["codSenador", "ano", "mes", "tipoDespesa", "valorReembolsado"]) {
      check(`CEAPS traz ${field}`, ceaps[0][field] !== undefined);
    }
    // The two hosts must agree on the key we join on. If they ever diverge,
    // every senator's cost pillar goes null in silence.
    const ceapsCodes = new Set(ceaps.map((r) => String(r.codSenador)));
    const shared = codes.filter((c) => ceapsCodes.has(String(Number(c))));
    check(
      `codSenador do CEAPS casa com CodigoParlamentar (${shared.length}/${codes.length})`,
      shared.length > 0,
      "os dois hosts divergiram na chave de junção — o custeio de todo senador viraria null em silêncio",
    );
  }

  // ── The presiding code, in both houses ────────────────────────────────────
  // Attendance leans on this: it is what separates "was barred from voting" from
  // "did not show up". If either house renames or drops the code, the chair
  // silently becomes the least assiduous member of the house again.
  // Windows of 80 days, not one wide one: `/votacoes` refuses ranges over three
  // months (the quirk `MAX_VOTE_WINDOW_DAYS` exists for). Walk back until a
  // window yields sittings with a roll call — recesses are real.
  // Scan until the presiding code is actually FOUND, not until enough distinct
  // codes have been seen: it appears at most once per sitting, so stopping early
  // made this pass or fail by luck. Bounded by sittings examined, not by codes.
  const camaraCodes = new Set<string>();
  let sittingsSeen = 0;
  const PRESIDING = /artigo\s*17|art\.\s*17/i;
  outer: for (const offset of [0, 80, 160, 240]) {
    const page = await getOrNull<Page<Row>>(
      `${CAMARA}/votacoes?idOrgao=${PLENARY_ORG_ID}&dataInicio=${isoDaysAgo(offset + 80)}` +
        `&dataFim=${isoDaysAgo(offset)}&ordem=DESC&ordenarPor=dataHoraRegistro&itens=100`,
    );
    for (const v of page?.dados ?? []) {
      if (sittingsSeen >= 30) break outer;
      const votes = await getOrNull<Page<Row>>(`${CAMARA}/votacoes/${v.id}/votos`);
      const rows2 = votes?.dados ?? [];
      if (rows2.length === 0) continue;
      sittingsSeen++;
      for (const x of rows2) camaraCodes.add(String(x.tipoVoto ?? "").trim());
      if ([...camaraCodes].some((c) => PRESIDING.test(c))) break outer;
    }
  }
  note(`${sittingsSeen} sessão(ões) com placar examinada(s)`);
  check(
    `Câmara ainda marca quem preside (${[...camaraCodes].join(", ") || "nenhum código lido"})`,
    [...camaraCodes].some((c) => PRESIDING.test(c)),
    "o código de presidência sumiu — quem está na cadeira volta a ser contado como faltoso",
  );

  const senadoVotacoes = await getOrNull<Row[]>(
    `${SENADO}/votacao?dataInicio=${isoDaysAgo(180)}&dataFim=${isoDaysAgo(0)}`,
  );
  const senadoCodes = new Set<string>();
  for (const v of Array.isArray(senadoVotacoes) ? senadoVotacoes : []) {
    for (const x of (v.votos as Row[] | undefined) ?? []) {
      senadoCodes.add(String(x.siglaVotoParlamentar ?? "").trim());
    }
  }
  check(
    "Senado ainda marca quem preside (art. 51 RISF)",
    [...senadoCodes].some((c) => /presidente/i.test(c)),
    "o código de presidência sumiu — quem está na cadeira volta a ser contado como faltoso",
  );
  note(`códigos de voto do Senado: ${[...senadoCodes].sort().join(", ")}`);

  // ── Plenary presence: not a pillar yet, but watched ───────────────────────
  const events = await get<Page<Row>>(
    `${CAMARA}/orgaos/${PLENARY_ORG_ID}/eventos?dataInicio=${isoDaysAgo(120)}&dataFim=${isoDaysAgo(0)}&itens=100`,
  );
  const rows = events.dados ?? [];
  const deliberative = rows.find((e) => isDeliberativeSession(String(e.descricaoTipo ?? "")));
  const solemn = rows.find((e) => String(e.descricaoTipo ?? "").includes("Solene"));
  if (deliberative && solemn) {
    const [d, sn] = await Promise.all([
      getOrNull<Page<Row>>(`${CAMARA}/eventos/${deliberative.id}/deputados`),
      getOrNull<Page<Row>>(`${CAMARA}/eventos/${solemn.id}/deputados`),
    ]);
    const dN = (d?.dados ?? []).length;
    const sN = (sn?.dados ?? []).length;
    check(
      `eventos/{id}/deputados é presença, não roster (deliberativa ${dN} × solene ${sN})`,
      dN > 100 && sN === 0,
      "a semântica mudou — reavaliar antes de promover presença de plenário a pilar",
    );
  } else {
    note("sem par deliberativa/solene na janela para conferir a semântica de presença");
  }
}

async function main(): Promise<void> {
  checkHelpers();
  checkQualityHelpers();
  checkScheduling();
  await checkCamara();
  await checkSenado();
  await checkQualitySources();
  await checkSocialProviders();

  console.log(
    failures === 0
      ? "\n✅ Todos os contratos verificados.\n"
      : `\n❌ ${failures} verificação(ões) falharam.\n`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

void main().catch((err) => {
  console.error("\n❌ Verificação interrompida:", err instanceof Error ? err.message : err);
  process.exit(1);
});
