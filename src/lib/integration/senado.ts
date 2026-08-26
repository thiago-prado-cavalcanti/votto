/**
 * Senado Federal — Dados Abertos integration.
 *
 * Base: https://legis.senado.leg.br/dadosabertos (append `Accept: application/json`;
 * the service otherwise replies with XML).
 *
 * Built on the **current** services. The legacy `materia/*` family that this
 * integration originally used was deprecated on 2025-03-18 and scheduled for
 * shutdown on 2026-02-01, with `/processo` named as its replacement; it still
 * answers today but must not be relied on. The endpoints used here are:
 *
 *   `composicao/lista/partidos`  → Party names (resolved against sitting senators)
 *   `senador/lista/atual`        → PublicAgent (SENATOR)
 *   `processo`                   → Theme (bills; `numdias` up to 30 days, date
 *                                  range beyond that — see `syncThemes`)
 *   `processo/{id}`              → classification, keywords, situation
 *   `votacao`                    → AGENT Vote (nominal roll calls, with `votos[]`)
 *
 * `senador/*` still returns the old deeply-nested XML-shaped JSON (single objects
 * instead of one-element arrays), so those payloads are read defensively; the
 * `processo`/`votacao` services return plain JSON arrays.
 */
import {
  billTitle,
  counters,
  dateWindows,
  fetchJson,
  mergeDuplicateParties,
  parseDate,
  PROGRESS_INTERVAL,
  reconcileInOffice,
  resolvePartyIdByAcronym,
  sleep,
  splitName,
  syncPartyAgentCounts,
  upsertAgent,
  upsertAgentVote,
  upsertArticle,
  upsertTheme,
  recordRollCall,
  mapOrientation,
  foldBloc,
  upsertServiceSpan,
  upsertAgentMetrics,
  type Counters,
  type SyncOptions,
  type SyncResult,
  type ThemeClassification,
} from "@/lib/integration/importer";
import { computePriority, isConcludedSituation } from "@/lib/domain/priority";
// The index window is one definition for both houses, so it lives beside the
// legislature arithmetic that produced it rather than being restated here.
import { windowYears } from "@/lib/integration/camara";
import { db } from "@/lib/db";
import { AgentType, House, ImportSource, Scope, ServiceKind, VoteValue } from "@/generated/prisma";

const BASE = "https://legis.senado.leg.br/dadosabertos";
const SOURCE = ImportSource.SENADO;
const REQUEST_DELAY = 300;

/** `processo?numdias=` is capped at 30 by the service. */
const MAX_NUMDIAS = 30;

/** JSON request headers for the Senado service. */
const JSON_HEADERS = { Accept: "application/json" } as const;

// ─── Defensive access helpers (legacy senador/* payloads) ────────────────────

/** Treat any value as an object record (or empty object). */
function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
}

/** Coerce a possibly-single value into an array (the legacy API omits arrays of 1). */
function arr<T = unknown>(v: unknown): T[] {
  if (Array.isArray(v)) return v as T[];
  if (v === undefined || v === null || v === "") return [];
  return [v as T];
}

/** Read a string-ish leaf value. */
function str(v: unknown): string | undefined {
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  return undefined;
}

/**
 * Read a URL leaf, forced to https.
 *
 * The Senado still publishes some `UrlFotoParlamentar` over plain http, and a
 * browser on an https page drops those images as mixed content — silently, and
 * only in production, since a local dev server is itself http. The host answers
 * `301` to the https form, so upgrading on the way in costs nothing and keeps
 * the stored value usable by anything that reads it later.
 */
function secureUrl(v: unknown): string | undefined {
  const raw = str(v);
  return raw?.startsWith("http://") ? "https://" + raw.slice("http://".length) : raw;
}

/** Walk a dotted path through nested objects, tolerating missing levels. */
function dig(root: unknown, path: string): unknown {
  let cur: unknown = root;
  for (const key of path.split(".")) {
    cur = obj(cur)[key];
    if (cur === undefined) return undefined;
  }
  return cur;
}

/**
 * Whether a vote code marks the senator who was presiding.
 *
 * Art. 51 of the RISF keeps the chair out of open ballots. Measured over a year
 * the code appeared exactly once per sitting — 39 of 46 of them the Senate
 * President's — so leaving it uncorrected filed the presiding officer at the 1st
 * percentile of attendance while he had in fact been in the room every time.
 */
function isPresidingVote(sigla: string | undefined | null): boolean {
  const t = (sigla ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  return t.includes("presidente");
}

/** Fetch JSON from the Senado service, returning null on any failure. */
async function tryFetch<T = unknown>(path: string): Promise<T | null> {
  try {
    return await fetchJson<T>(`${BASE}${path}`, { headers: JSON_HEADERS });
  } catch {
    return null;
  }
}

// ─── Response shapes for the current (plain-JSON) services ───────────────────

interface SenadoProcesso {
  id?: number;
  codigoMateria?: number;
  identificacao?: string;
  sigla?: string;
  numero?: string;
  ano?: number;
  ementa?: string;
  tramitando?: string;
  situacaoAtual?: string;
  dataApresentacao?: string;
  dataSituacaoAtual?: string;
  dataUltimaAtualizacao?: string;
  urlDocumento?: string;
  tipoDocumento?: string;
}

interface SenadoAutoria {
  autor?: string;
  siglaTipo?: string;
  codigoParlamentar?: number;
}

interface SenadoRelatoria {
  codigoParlamentar?: number;
  dataDestituicao?: string | null;
}

interface SenadoProcessoDetalhe extends SenadoProcesso {
  autoriaIniciativa?: SenadoAutoria[];
  classificacoes?: Array<{ codigo?: number; descricao?: string; descricaoHierarquia?: string }>;
  documento?: { indexacao?: string; url?: string; tipo?: string };
  ordensDoDia?: Array<{ dataSessao?: string }>;
  conteudo?: { ementa?: string };
}

interface SenadoVoto {
  codigoParlamentar?: number;
  nomeParlamentar?: string;
  siglaPartidoParlamentar?: string;
  siglaUFParlamentar?: string;
  siglaVotoParlamentar?: string;
}

interface SenadoVotacao {
  codigoMateria?: number;
  idProcesso?: number;
  codigoSessaoVotacao?: number;
  /** Chave de junção com o serviço de orientação de bancada. */
  sequencialVotacao?: number;
  identificacao?: string;
  ementa?: string;
  dataSessao?: string;
  votacaoSecreta?: string;
  votos?: SenadoVoto[];
}

// ─── Shared mapping ──────────────────────────────────────────────────────────

/**
 * Map a Senado vote code to a VoteValue. Only declared positions count: the
 * service also emits absence codes (AP, MIS, LS, LP, LAP), "present but did not
 * register" (P-NRV), the presiding officer's non-vote, and the placeholder
 * "Votou" used for secret ballots — none of which is a position on the merits.
 */
function mapVote(sigla: string | undefined): VoteValue | null {
  const t = (sigla ?? "").trim().toLowerCase();
  if (!t) return null;
  if (t === "sim") return VoteValue.YES;
  if (t === "não" || t === "nao") return VoteValue.NO;
  if (t.startsWith("absten")) return VoteValue.ABSTENTION;
  return null;
}

/** Stable external reference for a bill: the legacy matéria code when present. */
function themeRef(p: { codigoMateria?: number; id?: number; idProcesso?: number }): string | null {
  if (p.codigoMateria != null) return String(p.codigoMateria);
  const processId = p.id ?? p.idProcesso;
  return processId != null ? `processo:${processId}` : null;
}

/** Public page for a bill on senado.leg.br. */
function billUrl(codigoMateria: number | undefined): string | null {
  return codigoMateria == null
    ? null
    : `https://www25.senado.leg.br/web/atividade/materias/-/materia/${codigoMateria}`;
}

// ─── Parties ─────────────────────────────────────────────────────────────────

/**
 * Import the parties that actually hold Senate seats.
 *
 * The `partidos` list covers every party that ever existed (ARENA, ANL, …), so
 * the sitting senators drive which ones are imported and the list only supplies
 * full names. A party is reused across houses when its acronym already exists —
 * otherwise "PT" would appear twice on the parties page, once per source.
 */
export async function syncParties(opts: SyncOptions = {}): Promise<SyncResult> {
  const c = counters();

  const acronyms = new Set<string>();
  for (const senator of await fetchSenators()) {
    const sigla = senator.partyAcronym;
    if (sigla) acronyms.add(sigla.toUpperCase());
  }

  for (const acronym of acronyms) {
    if (opts.limit && c.seen >= opts.limit) break;
    c.seen++;
    await resolvePartyId(acronym);
    c.upserted++;
  }

  const merged = await mergeDuplicateParties();
  if (merged > 0) {
    opts.onProgress?.({ seen: c.seen, upserted: c.upserted, note: `${merged} partido(s) duplicado(s) fundido(s)` });
  }

  return { itemsSeen: c.seen, itemsUpserted: c.upserted };
}

/**
 * Acronym → full party name, from the Senado's own catalogue. Fetched once per
 * run and shared by every step that has to resolve a party: the full name is
 * what lets a Senado acronym match a party the Câmara already imported under a
 * different abbreviation.
 */
let partyNamesOnce: Promise<Map<string, string>> | null = null;

async function partyNames(): Promise<Map<string, string>> {
  // Memoizada porque `resolvePartyId` agora consulta o nome a cada sigla, e o
  // job de votos resolve uma sigla por senador de cada votação — sem isto seriam
  // milhares de requisições para a mesma lista de trinta linhas.
  //
  // Cache de processo, e a defasagem é aceitável: o que ela guarda é a *dica de
  // casamento* entre sigla e nome, não o dado publicado. O nome que vai para o
  // banco vem de `upsertParty`, no job de partidos, a cada execução.
  partyNamesOnce ??= (async () => {
    const names = new Map<string, string>();
    const list = await tryFetch(`/composicao/lista/partidos`);
    await sleep(REQUEST_DELAY);
    for (const p of arr(dig(list, "ListaPartidos.Partidos.Partido"))) {
      const sigla = str(obj(p).Sigla);
      const nome = str(obj(p).Nome);
      if (sigla && nome) names.set(sigla.toUpperCase(), nome);
    }
    return names;
  })();
  return partyNamesOnce;
}

/**
 * Resolve the internal Party id for an acronym, reusing a party already imported
 * by any source (typically the Câmara) so each party exists exactly once.
 *
 * **O nome é buscado aqui, e nunca recebido do chamador.** O desempate entre
 * casas é por nome — a Câmara escreve `PODE` onde o Senado escreve `PODEMOS`, e
 * as duas concordam em "Podemos" —, então passar a própria sigla no lugar do
 * nome não só perde o desempate como o *desliga*: `resolvePartyIdByAcronym` só
 * consulta por nome quando ele difere da sigla. Foi exatamente o que aconteceu
 * em `upsertPastSenator`, que não tinha o mapa à mão e passava `key, key` — e o
 * resultado foi um segundo "Podemos" com os três senadores, enquanto os 27
 * deputados ficaram no primeiro. Uma bancada partida em duas não é cosmética:
 * coesão, alinhamento e o encolhimento de `pooling.ts` passam a ler dois
 * partidos onde há um.
 *
 * `partyNames()` é uma requisição só e memoizada, então buscar aqui não custa
 * nada por chamada.
 */
async function resolvePartyId(acronym: string): Promise<string | null> {
  const names = await partyNames();
  return resolvePartyIdByAcronym(acronym, {
    source: SOURCE,
    name: names.get(acronym.trim().toUpperCase()),
  });
}

// ─── Senators ────────────────────────────────────────────────────────────────

/** A senator, flattened out of the legacy nested payload. */
interface SenatorRecord {
  code: string;
  fullName: string;
  partyAcronym?: string;
  state?: string;
  imageUrl?: string;
  email?: string;
  profileUrl?: string;
}

/** Read the sitting senators, flattening the legacy nested shape. */
async function fetchSenators(): Promise<SenatorRecord[]> {
  const data = await tryFetch("/senador/lista/atual");
  await sleep(REQUEST_DELAY);
  if (!data) return [];

  const list = arr(dig(data, "ListaParlamentarEmExercicio.Parlamentares.Parlamentar"));
  const out: SenatorRecord[] = [];

  for (const item of list) {
    const ident = obj(dig(item, "IdentificacaoParlamentar"));
    const code = str(ident.CodigoParlamentar);
    if (!code) continue;
    out.push({
      code,
      fullName:
        str(ident.NomeParlamentar) ?? str(ident.NomeCompletoParlamentar) ?? "",
      partyAcronym: str(ident.SiglaPartidoParlamentar),
      state: str(ident.UfParlamentar),
      imageUrl: secureUrl(ident.UrlFotoParlamentar),
      email: str(ident.EmailParlamentar),
      profileUrl: secureUrl(ident.UrlPaginaParlamentar),
    });
  }
  return out;
}

/**
 * Import the senators currently in exercise, linking each to its party. Senators
 * who leave (mandate end, substitute stepping down) are marked `inOffice: false`
 * so their vote history is preserved for the alignment index.
 */
export async function syncAgents(opts: SyncOptions = {}): Promise<SyncResult> {
  const c = counters();
  const senators = await fetchSenators();
  const partyCache = new Map<string, string>();
  const seenRefs: string[] = [];

  for (const s of senators) {
    if (opts.limit && c.seen >= opts.limit) break;
    c.seen++;

    let partyId: string | null = null;
    if (s.partyAcronym) {
      const key = s.partyAcronym.toUpperCase();
      partyId = partyCache.get(key) ?? (await resolvePartyId(key));
      // `null` é rótulo que não é partido (`NOT_A_PARTY` em `importer.ts`): o
      // senador fica sem partido, que é o fato, e a chave não entra no cache —
      // senão a consulta seguinte acharia a chave e leria `undefined`.
      if (partyId) partyCache.set(key, partyId);
    }

    const { firstName, lastName } = splitName(s.fullName, "Senador");
    await upsertAgent({
      source: SOURCE,
      externalRef: s.code,
      firstName,
      lastName,
      type: AgentType.SENATOR,
      email: s.email ?? null,
      imageUrl: s.imageUrl ?? null,
      state: s.state ?? null,
      externalUrl: s.profileUrl ?? null,
      inOffice: true,
      partyId,
    });
    seenRefs.push(s.code);
    c.upserted++;
  }

  if (!opts.limit) {
    await reconcileInOffice(SOURCE, AgentType.SENATOR, seenRefs);
  }
  await syncPartyAgentCounts();

  return { itemsSeen: c.seen, itemsUpserted: c.upserted };
}

// ─── Themes (bills under discussion) ─────────────────────────────────────────

/**
 * Upsert one bill as a Theme, enriching it with the detail record's official
 * classification hierarchy, indexing keywords and current situation. Returns the
 * internal theme id, or null when the bill carries no usable reference.
 */
async function upsertBillTheme(
  summary: SenadoProcesso,
  c: Counters,
  agentIdByRef: Map<string, string>,
  detail?: SenadoProcessoDetalhe | null,
): Promise<string | null> {
  const ref = themeRef(summary);
  if (!ref) return null;

  const processId = summary.id;
  const full =
    detail !== undefined
      ? detail
      : processId != null
        ? await tryFetchDetail(processId)
        : null;

  const identifier = summary.identificacao ?? full?.identificacao ?? `Processo ${ref}`;
  const situation = summary.situacaoAtual ?? full?.situacaoAtual ?? null;
  const inProgress =
    (summary.tramitando ?? full?.tramitando) === "Sim" && !isConcludedSituation(situation);
  const lastActionAt =
    parseDate(summary.dataUltimaAtualizacao ?? full?.dataUltimaAtualizacao) ??
    parseDate(summary.dataSituacaoAtual ?? full?.dataSituacaoAtual);

  const classifications: ThemeClassification[] | null = full?.classificacoes?.length
    ? full.classificacoes
        .filter((x) => x.codigo != null && x.descricao)
        .map((x) => ({
          code: String(x.codigo),
          label: x.descricao as string,
          hierarchy: x.descricaoHierarquia ?? undefined,
          // The Senado does not rank its classifications; the first is the primary.
          relevance: 0,
        }))
    : null;
  if (classifications?.length) classifications[0].relevance = 1;

  // The Senado publishes no procedural regime, so `urgency` stays null and the
  // priority ranking derives the bill's imminence from its situation instead
  // (see `situationBase`). Copying the situation in here would double-count it.
  const urgency = null;

  const ementa = summary.ementa ?? full?.ementa ?? full?.conteudo?.ementa ?? "";
  // Authorship rides along in the detail we already fetched — no extra request.
  const author = full?.autoriaIniciativa?.[0];
  const authorCode = author?.codigoParlamentar;
  // `agentIdByRef` is REQUIRED, like its Câmara twin: while it was optional, a
  // call site that omitted it left the bill written and only its authorship
  // empty, and nothing ever came back for it. See `upsertBillTheme` in
  // `camara.ts` and the repair in `scripts/reauthor.ts`.
  const proposerId = authorCode != null ? agentIdByRef.get(String(authorCode)) ?? null : null;
  const proposerName = proposerId ? null : author?.autor?.trim() || null;

  // The rapporteur needs its own call, so only for bills still in play.
  const rapporteurId =
    inProgress && processId != null ? await fetchRapporteur(processId, agentIdByRef) : null;

  const themeId = await upsertTheme({
    source: SOURCE,
    externalRef: ref,
    name: billTitle(identifier, ementa),
    summary: ementa,
    scope: Scope.NATIONAL,
    house: House.SENADO,
    identifier,
    externalUrl: billUrl(summary.codigoMateria ?? full?.codigoMateria),
    situation,
    urgency,
    keywords: full?.documento?.indexacao ?? null,
    presentedAt: parseDate(summary.dataApresentacao ?? full?.dataApresentacao),
    lastActionAt,
    inProgress,
    classifications,
    proposerId,
    proposerName,
    rapporteurId,
    priority: computePriority({ urgency, situation, identifier, inProgress, lastActionAt }),
  });
  c.upserted++;

  const documentUrl = summary.urlDocumento ?? full?.documento?.url;
  if (documentUrl) {
    await upsertArticle({
      source: SOURCE,
      externalRef: `processo:${ref}:documento`,
      themeId,
      originalUrl: billUrl(summary.codigoMateria ?? full?.codigoMateria) ?? documentUrl,
      title: `Texto original — ${identifier}`,
      downloadUrl: documentUrl,
    });
  }

  return themeId;
}

/** Fetch a bill's detail record, tolerating the array-or-object response shape. */
async function tryFetchDetail(processId: number): Promise<SenadoProcessoDetalhe | null> {
  const data = await tryFetch<SenadoProcessoDetalhe | SenadoProcessoDetalhe[]>(
    `/processo/${processId}`,
  );
  await sleep(REQUEST_DELAY);
  if (!data) return null;
  return Array.isArray(data) ? data[0] ?? null : data;
}

/**
 * Resolve the bill's current rapporteur. `/processo/relatoria` returns every
 * designation ever made, so the active one is the latest without a
 * `dataDestituicao`; a dismissed rapporteur is history, not accountability.
 */
async function fetchRapporteur(
  processId: number,
  agentIdByRef: Map<string, string>,
): Promise<string | null> {
  const rows = await tryFetch<SenadoRelatoria[]>(`/processo/relatoria?idProcesso=${processId}`);
  await sleep(REQUEST_DELAY);
  if (!Array.isArray(rows)) return null;

  const active = [...rows].reverse().find((r) => !r.dataDestituicao && r.codigoParlamentar != null);
  return active?.codigoParlamentar != null
    ? agentIdByRef.get(String(active.codigoParlamentar)) ?? null
    : null;
}

/**
 * Import the bills that moved in the look-back window.
 *
 * The service offers two incompatible ways to ask this, and the window decides
 * which one applies:
 *
 *   * `numdias` — "anything updated in the last N days", the broader signal and
 *     the right one for the weekly job. **Capped at 30 days by the service.**
 *   * `dataInicioDeliberacao`/`dataFimDeliberacao` — bills deliberated inside an
 *     arbitrary date range. Used for anything wider than the cap, so a six-month
 *     backfill actually covers six months instead of being silently clamped to
 *     the last thirty days.
 *
 * Deliberation is the right lens for a backfill: it is what produces floor
 * movement and roll calls, which is what the platform is about.
 */
export async function syncThemes(opts: SyncOptions = {}): Promise<SyncResult> {
  const c = counters();
  const agentIdByRef = await senatorIdsByRef();
  const days = opts.days ?? 30;

  const to = new Date();
  const from = new Date(to);
  from.setDate(from.getDate() - days);
  const start = from.toISOString().slice(0, 10);
  const end = to.toISOString().slice(0, 10);

  const query =
    days <= MAX_NUMDIAS
      ? `numdias=${days}`
      : `dataInicioDeliberacao=${start}&dataFimDeliberacao=${end}`;
  const watermark = days <= MAX_NUMDIAS ? `numdias:${days}` : end;

  const list = await tryFetch<SenadoProcesso[]>(`/processo?${query}`);
  await sleep(REQUEST_DELAY);
  if (!Array.isArray(list)) {
    return { itemsSeen: 0, itemsUpserted: 0, watermark };
  }

  for (const p of list) {
    if (opts.limit && c.seen >= opts.limit) break;
    c.seen++;
    if (c.seen % PROGRESS_INTERVAL === 0) {
      opts.onProgress?.({ seen: c.seen, upserted: c.upserted, note: `${c.seen}/${list.length} processos` });
    }
    await upsertBillTheme(p, c, agentIdByRef);
  }

  return { itemsSeen: c.seen, itemsUpserted: c.upserted, watermark };
}

/**
 * Re-resolve authorship for bills already imported that carry none — the Senado
 * half of the repair described on {@link import("./camara").repairAuthorship}.
 *
 * Costs one extra request per bill, because {@link themeRef} keys a theme by
 * `codigoMateria` while the detail (where `autoriaIniciativa` lives) is keyed by
 * the *process* id. `/processo?codigoMateria=` returns the same summary row the
 * sweeps read, process id included, so the repair rejoins the normal path
 * instead of duplicating its mapping.
 */
export async function repairAuthorship(opts: SyncOptions = {}): Promise<SyncResult> {
  const c = counters();
  const agentIdByRef = await senatorIdsByRef();

  const pending = await db.theme.findMany({
    where: {
      source: SOURCE,
      inProgress: true,
      proposerId: null,
      proposerName: null,
    },
    orderBy: [{ priority: "desc" }, { lastActionAt: "desc" }],
    ...(opts.limit ? { take: opts.limit } : {}),
    select: { externalRef: true },
  });

  for (const theme of pending) {
    const ref = theme.externalRef;
    if (!ref) continue;
    c.seen++;
    if (c.seen % PROGRESS_INTERVAL === 0) {
      opts.onProgress?.({
        seen: c.seen,
        upserted: c.upserted,
        note: `${c.seen}/${pending.length} processos sem autoria`,
      });
    }

    const summary = await resolveProcessSummary(ref);
    if (!summary) continue;
    await upsertBillTheme(summary, c, agentIdByRef);
  }

  return { itemsSeen: c.seen, itemsUpserted: c.upserted };
}

/**
 * Recover the summary row behind a stored `externalRef`, in either of the two
 * shapes {@link themeRef} produces: a bare `codigoMateria`, or `processo:{id}`
 * for the bills the service never gave a matéria code.
 */
async function resolveProcessSummary(ref: string): Promise<SenadoProcesso | null> {
  const viaProcess = ref.startsWith("processo:") ? Number(ref.slice("processo:".length)) : null;
  if (viaProcess != null) return Number.isFinite(viaProcess) ? { id: viaProcess } : null;

  const code = Number(ref);
  if (!Number.isFinite(code)) return null;
  const rows = await tryFetch<SenadoProcesso[]>(`/processo?codigoMateria=${code}`);
  await sleep(REQUEST_DELAY);
  return Array.isArray(rows) ? rows[0] ?? null : null;
}

// ─── Floor agenda (the curated "what matters now" feed) ──────────────────────

/**
 * Situation codes that mean a bill is at or near a floor vote, strongest first.
 * From `/processo/tipos-situacao`; unlike the Câmara, the Senado does filter by
 * these server-side, so this is a genuine relevance query rather than a sweep.
 */
const AGENDA_SITUATIONS = [
  "INCLOD", // Incluída em ordem do dia — being voted now.
  "AGDDO", // Agendada para ordem do dia.
  "PRONDEPLEN", // Pronto para deliberação do Plenário.
] as const;

/**
 * Import the bills that are on, or ready for, the Senate floor.
 *
 * Cheap and precise: three list requests instead of a six-month sweep. The order
 * of {@link AGENDA_SITUATIONS} is the ranking — a bill already on the order of
 * the day outranks one merely declared ready — so `opts.limit` keeps the most
 * imminent N.
 */
export async function syncAgendaThemes(opts: SyncOptions = {}): Promise<SyncResult> {
  const c = counters();
  const agentIdByRef = await senatorIdsByRef();
  const candidates: SenadoProcesso[] = [];
  const seenRefs = new Set<string>();

  for (const situation of AGENDA_SITUATIONS) {
    const list = await tryFetch<SenadoProcesso[]>(
      `/processo?siglaSituacao=${situation}&tramitando=S`,
    );
    await sleep(REQUEST_DELAY);
    if (!Array.isArray(list)) continue;

    for (const p of list) {
      const ref = themeRef(p);
      if (!ref || seenRefs.has(ref)) continue;
      seenRefs.add(ref);
      candidates.push(p);
    }
  }

  const selected = opts.limit ? candidates.slice(0, opts.limit) : candidates;
  for (const p of selected) {
    c.seen++;
    if (c.seen % PROGRESS_INTERVAL === 0) {
      opts.onProgress?.({
        seen: c.seen,
        upserted: c.upserted,
        note: `${c.seen}/${selected.length} processos em pauta`,
      });
    }
    await upsertBillTheme(p, c, agentIdByRef);
  }

  return { itemsSeen: c.seen, itemsUpserted: c.upserted };
}

// ─── Votes ───────────────────────────────────────────────────────────────────

/** Map `senator externalRef → internal agent id`, for vote attachment. */
async function senatorIdsByRef(): Promise<Map<string, string>> {
  const agents = await db.publicAgent.findMany({
    where: { source: SOURCE, type: AgentType.SENATOR },
    select: { id: true, externalRef: true },
  });
  return new Map(
    agents
      .filter((a): a is { id: string; externalRef: string } => Boolean(a.externalRef))
      .map((a) => [a.externalRef, a.id]),
  );
}

/**
 * Import the nominal roll calls held in the look-back window, together with the
 * bills they decided. Secret ballots are skipped: the service publishes only
 * totals for those, and a per-senator position is exactly what we need.
 */
/**
 * Largest window `/votacao` accepts, in days.
 *
 * Measured against the live endpoint, not guessed: 365 days returns 96 votações
 * with HTTP 200; **545 and anything above return HTTP 400**. The Câmara's cap is
 * three months and was already documented; this one was not, and its absence cost
 * a real import — a four-year request came back refused and the job reported
 * "0 registros atualizados · OK".
 */
const MAX_VOTE_WINDOW_DAYS = 365;

/** Uma votação no serviço de orientação de bancada. */
interface SenadoOrientacaoVotacao {
  sequencialVotacao?: number;
  orientacoesLideranca?: Array<{ partido?: string; voto?: string }>;
}

/**
 * Orientação dos pseudo-blocos `Governo` e `Oposição` numa janela de datas.
 *
 * **O Senado publica isto — só não onde se procuraria.** A Câmara expõe a
 * orientação por votação, em `/votacoes/{id}/orientacoes`. O payload de
 * `/votacao` do Senado não tem campo de orientação nenhum, e foi por isso que a
 * casa passou por não ter o dado. Ele existe num serviço separado,
 * `/plenario/votacao/orientacaoBancada/{AAAAMMDD}/{AAAAMMDD}`, que devolve uma
 * faixa inteira de datas numa requisição e carrega os mesmos quatro
 * pseudo-blocos (`Governo`, `Oposição`, `Minoria`, `Maioria`).
 *
 * Duas armadilhas de formato, ambas medidas contra o serviço vivo:
 *
 *  - **As datas são `AAAAMMDD` sem hífen.** A forma pontilhada que o resto da
 *    API do Senado aceita devolve 404 aqui.
 *  - **A chave de junção é `sequencialVotacao`**, não `codigoSessaoVotacao`. Ela
 *    já vem nas linhas de `/votacao` que o importador baixa, então isto custa
 *    **uma requisição por janela, não uma por votação** — mais barato que o
 *    caminho da própria Câmara. Verificado: numa janela de março–abril de 2025,
 *    as 9 votações nominais casaram 9 de 9.
 *
 * **A limitação honesta é cobertura, não existência.** Medido sobre 997
 * votações nominais de 2019 a 2026, cerca de 48% trazem alguma orientação e
 * **37% trazem o bloco `Governo`**, contra praticamente 100% das nominais da
 * Câmara. E isso não é falha da API: Neiva (*Dados* 54(2), 2011) conta, de 1995
 * a 2006, **16.717 indicações de liderança em 1.642 votações da Câmara (média
 * 10,2) contra 2.544 em 1.016 do Senado (média 2,5)**, com muitas votações em
 * que nem os partidos maiores orientaram. O Colégio de Líderes não é
 * formalizado no Senado, e com 81 membros — na frase dele — "basta um gesto ou
 * um simples 'olhar'". A escassez é regimental.
 *
 * Consequência para quem lê o índice: o `governismo` de um senador tem
 * denominador próprio e não é comparável, um a um, com o de um deputado. É
 * exatamente por isso que `governismoBase` viaja sempre junto do número
 * (§3.2) e que abaixo do piso não há leitura.
 *
 * `Oposição` só aparece a partir de 2021, então antes disso o desconto de
 * contaminação só pode se apoiar no `Governo`.
 */
async function fetchOrientations(
  window: { start: string; end: string },
): Promise<Map<number, { government: VoteValue | null; opposition: VoteValue | null }>> {
  const out = new Map<number, { government: VoteValue | null; opposition: VoteValue | null }>();
  const compact = (iso: string) => iso.replace(/-/g, "");

  const data = await tryFetch<{ votacoes?: SenadoOrientacaoVotacao[] }>(
    `/plenario/votacao/orientacaoBancada/${compact(window.start)}/${compact(window.end)}`,
  );
  await sleep(REQUEST_DELAY);

  // Ao contrário de `/votacao`, uma janela sem orientação aqui não é motivo para
  // derrubar o import: o governismo é uma leitura publicada à parte e o resto da
  // votação — presença, posição, tema — continua correto sem ele. Ficar sem a
  // orientação degrada `governismo` para `null`, que é o que "não medido"
  // significa, e não corrompe nada.
  const rows = Array.isArray(data?.votacoes) ? data.votacoes : [];
  for (const row of rows) {
    if (row.sequencialVotacao == null) continue;
    const bloc = (name: string) =>
      (row.orientacoesLideranca ?? []).find((o) => foldBloc(o.partido) === name)?.voto;
    out.set(row.sequencialVotacao, {
      government: mapOrientation(bloc("governo")),
      opposition: mapOrientation(bloc("oposicao")),
    });
  }
  return out;
}

export async function syncVotes(opts: SyncOptions = {}): Promise<SyncResult> {
  const c = counters();
  const days = opts.days ?? 30;
  const to = new Date();
  const from = new Date(to);
  from.setDate(from.getDate() - days);

  const end = to.toISOString().slice(0, 10);

  // Chunked, because `/votacao` refuses more than a year. It was a single
  // request until a four-year look-back came back 400 and this job called that
  // success.
  const votacoes: SenadoVotacao[] = [];
  // Orientação de bancada, por `sequencialVotacao`. Uma requisição por janela,
  // na mesma varredura — o serviço aceita a faixa inteira de uma vez.
  const orientations = new Map<
    number,
    { government: VoteValue | null; opposition: VoteValue | null }
  >();
  for (const w of dateWindows(from, to, MAX_VOTE_WINDOW_DAYS)) {
    const page = await tryFetch<SenadoVotacao[]>(
      `/votacao?dataInicio=${w.start}&dataFim=${w.end}`,
    );
    await sleep(REQUEST_DELAY);

    // A refused window is a failure, not an empty one. `tryFetch` returns null
    // for a 400, a timeout and a parse error alike, and returning zero counts for
    // that made the panel print "0 registros atualizados · OK" over an import
    // that never happened — indistinguishable from a quiet week. Throwing puts
    // the reason in the job's failure note, where an operator reads it.
    if (!Array.isArray(page)) {
      throw new Error(
        `A fonte recusou a janela ${w.start}..${w.end} de /votacao. ` +
          `O teto do endpoint é ${MAX_VOTE_WINDOW_DAYS} dias por requisição.`,
      );
    }
    votacoes.push(...page);
    for (const [seq, o] of await fetchOrientations(w)) orientations.set(seq, o);
  }

  const agentIdByRef = await senatorIdsByRef();
  const partyCache = new Map<string, string>();
  const themeIdByRef = new Map<string, string>();
  let processed = 0;

  for (const v of votacoes) {
    if (opts.limit && processed >= opts.limit) break;
    processed++;
    opts.onProgress?.({
      seen: c.seen,
      upserted: c.upserted,
      note: `${processed}/${votacoes.length} votações`,
    });
    if (v.votacaoSecreta === "S") continue;

    const votos = Array.isArray(v.votos) ? v.votos : [];
    if (votos.length === 0) continue;

    const ref = themeRef(v);
    if (!ref) continue;

    let themeId = themeIdByRef.get(ref);
    if (!themeId) {
      const resolved = await upsertBillTheme(
        {
          id: v.idProcesso,
          codigoMateria: v.codigoMateria,
          identificacao: v.identificacao,
          ementa: v.ementa,
        },
        c,
        agentIdByRef,
      );
      if (!resolved) continue;
      themeId = resolved;
      themeIdByRef.set(ref, themeId);
    }

    const occurredAt = parseDate(v.dataSessao);
    const sessionRef = String(v.codigoSessaoVotacao ?? v.idProcesso ?? ref);
    // The same response feeds two records: the senator's standing position on
    // the bill (`Vote`, one per theme — what alignment reads) and the sitting
    // itself (`RollCall`, one per votação — what the quality index counts).
    const participants: Array<{ agentId: string; value: VoteValue }> = [];
    let presidingAgentId: string | null = null;

    for (const voto of votos) {
      if (voto.codigoParlamentar == null) continue;
      const value = mapVote(voto.siglaVotoParlamentar);
      // The chair is present but barred from voting. Caught before the `null`
      // guard below, because `mapVote` correctly reports "no position" and that
      // is exactly what would otherwise read as an absence.
      if (value === null) {
        if (isPresidingVote(voto.siglaVotoParlamentar)) {
          presidingAgentId =
            agentIdByRef.get(String(voto.codigoParlamentar)) ?? presidingAgentId;
        }
        continue;
      }
      c.seen++;

      const code = String(voto.codigoParlamentar);
      let agentId = agentIdByRef.get(code);
      if (!agentId) {
        // A roll call can reference a senator no longer in exercise (a substitute
        // who has since stepped down); record them as a past member.
        agentId = await upsertPastSenator(voto, partyCache);
        agentIdByRef.set(code, agentId);
      }

      participants.push({ agentId, value });

      const changed = await upsertAgentVote({
        source: SOURCE,
        externalRef: `votacao:${sessionRef}:senador:${code}`,
        themeId,
        agentId,
        value,
        occurredAt,
        sessionRef,
      });
      if (changed) c.upserted++;
    }

    // A sitting with no date cannot be placed inside a mandate window, so it
    // cannot serve as an attendance denominator — skip it rather than guess.
    if (occurredAt) {
      const orientation =
        v.sequencialVotacao != null ? orientations.get(v.sequencialVotacao) : undefined;
      await recordRollCall({
        source: SOURCE,
        externalRef: sessionRef,
        house: House.SENADO,
        occurredAt,
        themeId,
        participants,
        presidingAgentId,
        governmentPosition: orientation?.government ?? null,
        oppositionPosition: orientation?.opposition ?? null,
      });
    }
  }

  return { itemsSeen: c.seen, itemsUpserted: c.upserted, watermark: end };
}

/** Create a minimal record for a senator surfaced only by a past roll call. */
async function upsertPastSenator(
  voto: SenadoVoto,
  partyCache: Map<string, string>,
): Promise<string> {
  let partyId: string | null = null;
  if (voto.siglaPartidoParlamentar) {
    const key = voto.siglaPartidoParlamentar.toUpperCase();
    partyId = partyCache.get(key) ?? (await resolvePartyId(key));
    if (partyId) partyCache.set(key, partyId);
  }

  const { firstName, lastName } = splitName(voto.nomeParlamentar ?? "", "Senador");
  return upsertAgent({
    source: SOURCE,
    externalRef: String(voto.codigoParlamentar),
    firstName,
    lastName,
    type: AgentType.SENATOR,
    state: voto.siglaUFParlamentar ?? null,
    inOffice: false,
    partyId,
  });
}

// ─── Quality index: mandate record and running cost (CLAUDE.md §3.3) ─────────

/**
 * The Senado's administrative open data — a different host, still the Senado.
 *
 * `ImportSource` records *whose* data a row is, not which hostname served it, so
 * expenses imported from here are `SENADO` like everything else in this module.
 */
const ADM_BASE = "https://adm.senado.gov.br/adm-dadosabertos/api/v1";

/**
 * Document types counted as "projetos propostos".
 *
 * Requerimentos (RQS) and the like are excluded for the same reason as in the
 * Câmara: they are procedural traffic, and one sampled senator's authorship list
 * was overwhelmingly made of them.
 */
const AUTHORED_TYPES = new Set(["PL", "PLP", "PEC", "PDL", "PLS", "PRS"]);

interface SenadoRelatoria {
  codigoParlamentar?: number;
  idProcesso?: number;
  identificacaoProcesso?: string;
  dataDesignacao?: string;
  descricaoTipoRelator?: string;
}

interface SenadoCeaps {
  codSenador?: number;
  ano?: number;
  mes?: number;
  tipoDespesa?: string;
  valorReembolsado?: number;
}

/**
 * Import every sitting senator's mandate record: exercise stretches, official
 * leaves, substantive bills authored and bills reported.
 *
 * The Senado is the easier of the two houses here — it publishes exercise
 * intervals and leave intervals ready-made (`/senador/{cod}/mandatos`,
 * `/senador/{cod}/licencas`), where the Câmara publishes an event log that has
 * to be paired into intervals. It also publishes a *complete* rapporteur history
 * (`/processo/relatoria`), where the Câmara exposes only a bill's last
 * rapporteur. That asymmetry is why the quality index ranks inside a house and
 * never across: comparing a complete count with a floor would hand the Senado
 * the pillar for free.
 *
 * Built on `/processo*`, not on `/senador/{cod}/autorias` or `/relatorias`:
 * those are past their announced shutdown (2026-02-01) and still answering, but
 * building on a service the publisher has retired is borrowing trouble.
 */
export async function syncMandate(opts: SyncOptions = {}): Promise<SyncResult> {
  const c = counters();
  const years = windowYears();

  const senators = await db.publicAgent.findMany({
    where: { source: SOURCE, type: AgentType.SENATOR, inOffice: true },
    select: { id: true, externalRef: true },
  });
  const targets = opts.limit ? senators.slice(0, opts.limit) : senators;

  for (const [i, sen] of targets.entries()) {
    if (!sen.externalRef) continue;
    c.seen++;
    if (i % PROGRESS_INTERVAL === 0) {
      opts.onProgress?.({ seen: c.seen, upserted: c.upserted, note: `${i}/${targets.length} senadores` });
    }

    for (const span of await fetchServiceSpans(sen.externalRef)) {
      await upsertServiceSpan({
        source: SOURCE,
        externalRef: `senado:${span.kind}:${sen.externalRef}:${span.startsAt.toISOString().slice(0, 10)}`,
        agentId: sen.id,
        ...span,
      });
    }

    const authored = await fetchAuthoredByYear(sen.externalRef, years);
    const reported = await fetchRapporteuredByYear(sen.externalRef, years);

    for (const year of years) {
      await upsertAgentMetrics(
        sen.id,
        year,
        {
          billsAuthored: authored.get(year) ?? 0,
          billsRapporteured: reported.get(year) ?? 0,
        },
        SOURCE,
      );
    }
    c.upserted++;
  }

  return { itemsSeen: c.seen, itemsUpserted: c.upserted, watermark: new Date().toISOString().slice(0, 10) };
}

/**
 * A senator's exercise stretches and officially recorded leaves.
 *
 * Both feed the attendance denominator: roll calls held inside an EXERCISE
 * stretch, minus those inside a LEAVE. `LICENCA_ATIVIDADE_PARLAMENTAR` — a
 * one-day leave for an official mission — made up 770 of 877 records in a
 * 20-senator sample, so this is a large excusable surface, which is exactly why
 * `src/lib/indexes/quality.ts` caps how much of a window leave may cover before
 * the pillar refuses to score at all.
 */
async function fetchServiceSpans(
  code: string,
): Promise<Array<{ startsAt: Date; endsAt: Date | null; kind: ServiceKind; reason: string | null }>> {
  const spans: Array<{ startsAt: Date; endsAt: Date | null; kind: ServiceKind; reason: string | null }> = [];

  const mandatos = await tryFetch(`/senador/${encodeURIComponent(code)}/mandatos`);
  await sleep(REQUEST_DELAY);
  for (const mandato of arr(dig(mandatos, "MandatoParlamentar.Parlamentar.Mandatos.Mandato"))) {
    for (const ex of arr(dig(mandato, "Exercicios.Exercicio"))) {
      const startsAt = parseDate(str(obj(ex).DataInicio));
      if (!startsAt) continue;
      spans.push({
        startsAt,
        endsAt: parseDate(str(obj(ex).DataFim)),
        kind: ServiceKind.EXERCISE,
        reason: null,
      });
    }
  }

  const licencas = await tryFetch(`/senador/${encodeURIComponent(code)}/licencas`);
  await sleep(REQUEST_DELAY);
  for (const lic of arr(dig(licencas, "LicencaParlamentar.Parlamentar.Licencas.Licenca"))) {
    const l = obj(lic);
    const startsAt = parseDate(str(l.DataInicio));
    if (!startsAt) continue;
    spans.push({
      startsAt,
      endsAt: parseDate(str(l.DataFim) ?? str(l.DataFimPrevista)),
      kind: ServiceKind.LEAVE,
      reason: str(l.SiglaTipoAfastamento) ?? null,
    });
  }

  return spans;
}

/** Substantive bills the senator authored, by year of presentation. */
async function fetchAuthoredByYear(code: string, years: number[]): Promise<Map<number, number>> {
  const rows = await tryFetch<SenadoProcesso[]>(
    `/processo?codigoParlamentarAutor=${encodeURIComponent(code)}`,
  );
  await sleep(REQUEST_DELAY);
  const counts = new Map<number, number>();
  if (!Array.isArray(rows)) return counts;

  for (const row of rows) {
    const sigla = (row.identificacao ?? "").split(/\s+/)[0]?.toUpperCase();
    if (!sigla || !AUTHORED_TYPES.has(sigla)) continue;
    const at = parseDate(row.dataApresentacao);
    if (!at) continue;
    const year = at.getFullYear();
    if (!years.includes(year)) continue;
    counts.set(year, (counts.get(year) ?? 0) + 1);
  }
  return counts;
}

/**
 * Bills the senator was designated rapporteur for, by year of designation.
 *
 * "Relator ad hoc" — someone standing in for one sitting — is counted like any
 * other: the record does not distinguish how much work each involved, and
 * inventing a discount here would be editorialising over the source.
 */
async function fetchRapporteuredByYear(code: string, years: number[]): Promise<Map<number, number>> {
  const rows = await tryFetch<SenadoRelatoria[]>(
    `/processo/relatoria?codigoParlamentar=${encodeURIComponent(code)}`,
  );
  await sleep(REQUEST_DELAY);
  const counts = new Map<number, number>();
  if (!Array.isArray(rows)) return counts;

  for (const row of rows) {
    const at = parseDate(row.dataDesignacao?.slice(0, 10));
    if (!at) continue;
    const year = at.getFullYear();
    if (!years.includes(year)) continue;
    counts.set(year, (counts.get(year) ?? 0) + 1);
  }
  return counts;
}

/**
 * Import the senators' quota (CEAPS) — the running cost of the mandate.
 *
 * One request per year returns every senator's documents (~10 MB), which is why
 * this job costs a handful of requests against the Câmara's thousands: the
 * Senado publishes the whole year in one payload, keyed by `codSenador` — the
 * same code we store as `externalRef`.
 *
 * Scope note, same as the Câmara's: CEAPS is office upkeep, travel, fuel, food
 * and publicity. It is not emendas parlamentares, and the index would be saying
 * the opposite of the truth if it conflated the two (CLAUDE.md §3.3).
 */
export async function syncExpenses(opts: SyncOptions = {}): Promise<SyncResult> {
  const c = counters();
  const years = windowYears();
  const currentYear = new Date().getFullYear();

  const senators = await db.publicAgent.findMany({
    where: { source: SOURCE, type: AgentType.SENATOR },
    select: { id: true, externalRef: true },
  });
  const idByCode = new Map(
    senators
      .filter((s): s is { id: string; externalRef: string } => Boolean(s.externalRef))
      .map((s) => [s.externalRef, s.id]),
  );

  const settled = new Set(
    (
      await db.agentMetrics.findMany({
        where: { agentId: { in: senators.map((s) => s.id) }, year: { in: years } },
        select: { agentId: true, year: true, quotaDocuments: true },
      })
    )
      .filter((m) => m.year < currentYear && m.quotaDocuments > 0)
      .map((m) => `${m.agentId}:${m.year}`),
  );

  for (const year of years) {
    opts.onProgress?.({ seen: c.seen, upserted: c.upserted, note: `CEAPS ${year}` });

    let rows: SenadoCeaps[] | null = null;
    try {
      rows = await fetchJson<SenadoCeaps[]>(`${ADM_BASE}/senadores/despesas_ceaps/${year}`, {
        headers: JSON_HEADERS,
        timeoutMs: 120_000,
      });
    } catch {
      continue; // A year the service cannot serve is skipped, never zeroed.
    }
    await sleep(REQUEST_DELAY);
    if (!Array.isArray(rows)) continue;

    const totals = new Map<string, { spent: number; documents: number; byCategory: Map<string, number> }>();
    for (const row of rows) {
      const agentId = idByCode.get(String(row.codSenador));
      if (!agentId) continue;
      const value = typeof row.valorReembolsado === "number" ? row.valorReembolsado : 0;
      if (value <= 0) continue;
      const bucket = totals.get(agentId) ?? { spent: 0, documents: 0, byCategory: new Map<string, number>() };
      bucket.spent += value;
      bucket.documents++;
      const label = (row.tipoDespesa ?? "OUTROS").trim();
      bucket.byCategory.set(label, (bucket.byCategory.get(label) ?? 0) + value);
      totals.set(agentId, bucket);
    }
    c.seen += rows.length;

    for (const [agentId, bucket] of totals) {
      if (settled.has(`${agentId}:${year}`)) continue;
      await upsertAgentMetrics(
        agentId,
        year,
        {
          quotaSpent: round2(bucket.spent),
          quotaDocuments: bucket.documents,
          quotaByCategory: Object.fromEntries(
            [...bucket.byCategory.entries()].map(([k, v]) => [k, round2(v)]),
          ),
        },
        SOURCE,
      );
      c.upserted++;
    }
  }

  return { itemsSeen: c.seen, itemsUpserted: c.upserted, watermark: String(currentYear) };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
