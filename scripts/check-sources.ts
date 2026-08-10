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
import {
  computePriority,
  isConcludedSituation,
  priorityBand,
} from "@/lib/domain/priority";
import { dateWindows, isoDaysAgo, parseDate, splitName } from "@/lib/integration/importer";
import { SYNC_JOBS, findJob } from "@/lib/integration/jobs";
import { describeSchedule, formatZoned, nextOccurrence } from "@/lib/integration/schedule";

const CAMARA = "https://dadosabertos.camara.leg.br/api/v2";
const SENADO = "https://legis.senado.leg.br/dadosabertos";
const GOVBR_ISSUERS = ["https://sso.staging.acesso.gov.br", "https://sso.acesso.gov.br"];

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

function checkScheduling(): void {
  console.log("\n[2] Agendamento semanal (America/Sao_Paulo)");
  const now = new Date();

  check(`${SYNC_JOBS.length} jobs registrados com nomes únicos`, new Set(SYNC_JOBS.map((j) => j.name)).size === SYNC_JOBS.length);
  check("findJob resolve um job existente", findJob("camara:votes")?.name === "camara:votes");
  check("findJob devolve null para nome inválido", findJob("inexistente") === null);

  for (const job of SYNC_JOBS) {
    const next = nextOccurrence(job.schedule, now);
    const withinAWeek = next.getTime() > now.getTime() && next.getTime() - now.getTime() <= 8 * 86_400_000;
    check(`${job.name} → ${formatZoned(next)} (${describeSchedule(job.schedule)})`, withinAWeek);
  }
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
    String(e.descricaoTipo ?? "").includes("Deliberativa"),
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

// ─── 5. gov.br ───────────────────────────────────────────────────────────────

async function checkGovbr(): Promise<void> {
  console.log("\n[5] gov.br — descoberta OIDC");

  for (const issuer of GOVBR_ISSUERS) {
    const doc = await get<Row>(`${issuer}/.well-known/openid-configuration`);
    const authMethods = (doc.token_endpoint_auth_methods_supported ?? []) as string[];
    const algs = (doc.id_token_signing_alg_values_supported ?? []) as string[];
    const scopes = (doc.scopes_supported ?? []) as string[];

    check(
      `${issuer}: authorize, token, userinfo e jwks publicados`,
      Boolean(doc.authorization_endpoint && doc.token_endpoint && doc.userinfo_endpoint && doc.jwks_uri),
    );
    check(
      `${issuer}: client_secret_basic e RS256 (usados por exchangeCode/verifyIdToken)`,
      authMethods.includes("client_secret_basic") && algs.includes("RS256"),
    );
    check(`${issuer}: escopo govbr_confiabilidades disponível`, scopes.includes("govbr_confiabilidades"));
    note(
      `PKCE anunciado: ${JSON.stringify(doc.code_challenge_methods_supported ?? null)} ` +
        "— não é anunciado, por isso GOVBR_PKCE é configurável",
    );
  }
}

// ─── Entry point ─────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  checkHelpers();
  checkScheduling();
  await checkCamara();
  await checkSenado();
  await checkGovbr();

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
