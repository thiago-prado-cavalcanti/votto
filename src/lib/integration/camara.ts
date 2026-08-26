/**
 * Câmara dos Deputados — Dados Abertos API v2 integration.
 *
 * Base: https://dadosabertos.camara.leg.br/api/v2 (REST/JSON, no auth, refreshed
 * daily). Exposed as four independently schedulable steps (see `jobs.ts`):
 *
 *   `syncParties`  — `partidos` (+ per-party detail) → Party
 *   `syncAgents`   — `deputados` of the current legislature → PublicAgent
 *   `syncThemes`   — `proposicoes` in progress (+ detail, `/temas`) → Theme
 *   `syncVotes`    — `votacoes` + `votos` → AGENT Vote, and the Theme behind each
 *
 * Two quirks of this API drive the design:
 *
 *  1. **`uriProposicaoObjeto` is almost always null** on the `votacoes` list, so
 *     a votação cannot be linked to its bill from the list alone. The detail
 *     endpoint's `proposicoesAfetadas` carries the real link and is used instead.
 *  2. **Only plenary roll calls have nominal votes.** Symbolic and committee
 *     votes return an empty `votos` array; those votações are skipped rather than
 *     recorded as themes nobody voted on.
 *
 * The API also rejects `votacoes` date ranges wider than three months, so any
 * look-back is chunked into windows (see `dateWindows`).
 */
import { CURRENT_TERM } from "@/lib/domain/terms";
import { CAMARA_CODES_BY_AREA, POLICY_AREAS } from "@/lib/domain/policy-areas";
import {
  billTitle,
  counters,
  dateWindows,
  fetchJson,
  isoDaysAgo,
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
  upsertParty,
  upsertTheme,
  verifyImageUrl,
  recordRollCall,
  upsertServiceSpan,
  upsertAgentMetrics,
  type Counters,
  type SyncOptions,
  type SyncResult,
  type ThemeClassification,
  foldBloc,
  mapOrientation,
} from "@/lib/integration/importer";
import { computePriority, isConcludedSituation } from "@/lib/domain/priority";
import { db } from "@/lib/db";
import { AgentType, House, ImportSource, Scope, ServiceKind, VoteValue } from "@/generated/prisma";

const BASE = "https://dadosabertos.camara.leg.br/api/v2";
const SOURCE = ImportSource.CAMARA;

/** Polite delay between paged/related requests (ms). */
const REQUEST_DELAY = 220;

/** The `votacoes` endpoint refuses ranges wider than three months. */
const MAX_VOTE_WINDOW_DAYS = 85;

/**
 * Órgão id of the Câmara's floor (Plenário).
 *
 * Nominal votes exist only there: committee decisions are taken symbolically, so
 * their `votos` array is always empty. Measured over a three-month window, every
 * votação carrying a roll-call tally belonged to PLEN and no other órgão — so
 * scoping the query to it costs no coverage and avoids ~10× the requests.
 */
const PLENARY_ORG_ID = 180;

/**
 * Bill types worth importing as Themes. The API is dominated by procedural
 * paperwork (requerimentos, pareceres, destaques) that no citizen would
 * meaningfully vote on; these are the types that carry actual policy.
 */
const POLICY_TYPES = ["PL", "PLP", "PEC", "MPV", "PDL", "PLV", "PLN"] as const;

// ─── Minimal response shapes (only the fields we read) ───────────────────────

interface CamaraLink {
  rel?: string;
  href?: string;
}

interface CamaraPage<T> {
  dados?: T[];
  links?: CamaraLink[];
}

interface CamaraPartido {
  id?: number;
  sigla?: string;
  nome?: string;
  urlLogo?: string;
}

interface CamaraPartidoDetalhe extends CamaraPartido {
  urlWebSite?: string | null;
  status?: {
    totalMembros?: string;
    situacao?: string;
    lider?: { nome?: string };
  };
}

interface CamaraDeputado {
  id?: number;
  nome?: string;
  siglaPartido?: string;
  siglaUf?: string;
  urlFoto?: string;
  email?: string;
  idLegislatura?: number;
}

interface CamaraVotacao {
  id?: string;
  data?: string;
  dataHoraRegistro?: string;
  descricao?: string;
  siglaOrgao?: string;
  uriProposicaoObjeto?: string;
}

interface CamaraProposicaoRef {
  id?: number;
  siglaTipo?: string;
  numero?: number;
  ano?: number;
  ementa?: string;
}

interface CamaraVotacaoDetalhe extends CamaraVotacao {
  proposicoesAfetadas?: CamaraProposicaoRef[];
  objetosPossiveis?: CamaraProposicaoRef[];
}

interface CamaraProposicao extends CamaraProposicaoRef {
  dataApresentacao?: string;
  urlInteiroTeor?: string;
  keywords?: string;
  ementaDetalhada?: string;
  descricaoTipo?: string;
  statusProposicao?: {
    dataHora?: string;
    regime?: string;
    descricaoSituacao?: string;
    descricaoTramitacao?: string;
    uriUltimoRelator?: string;
    apreciacao?: string;
    siglaOrgao?: string;
  };
}

interface CamaraAutor {
  uri?: string;
  nome?: string;
  tipo?: string;
  proponente?: number;
}

interface CamaraTema {
  codTema?: number;
  tema?: string;
  relevancia?: number;
}

/** Uma linha de `/votacoes/{id}/orientacoes`. */
interface CamaraOrientacao {
  /** Sigla da bancada — inclui os pseudo-blocos `Governo`, `Oposição`, `Maioria`, `Minoria`. */
  siglaPartidoBloco?: string;
  /** "Sim", "Não", "Liberado", "Obstrução". */
  orientacaoVoto?: string;
}

interface CamaraVoto {
  tipoVoto?: string;
  dataRegistroVoto?: string;
  deputado_?: {
    id?: number;
    nome?: string;
    siglaPartido?: string;
    siglaUf?: string;
    urlFoto?: string;
    idLegislatura?: number;
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Map a Câmara `tipoVoto` string to our VoteValue (null = ignore the record). */
function mapVote(tipo: string | undefined): VoteValue | null {
  const t = (tipo ?? "").trim().toLowerCase();
  if (t === "sim") return VoteValue.YES;
  if (t === "não" || t === "nao") return VoteValue.NO;
  if (t === "abstenção" || t === "abstencao") return VoteValue.ABSTENTION;
  // Obstruction is a declared stance against letting the vote proceed — the
  // closest of our three values is abstaining.
  if (t === "obstrução" || t === "obstrucao") return VoteValue.ABSTENTION;
  // "Artigo 17" is the Speaker, who only votes to break ties: not a position.
  return null;
}

/**
 * Whether a vote code marks the deputy who was presiding.
 *
 * Art. 17 of the RICD keeps the Speaker out of open ballots — they vote only to
 * break a tie. Measured over 20 sittings the code appeared 17 times, 16 of them
 * the Speaker's, so it is one person per sitting and not a rare edge case: left
 * uncorrected it would file whoever holds the chair as the least assiduous
 * member of the house.
 */
function isPresidingVote(tipoVoto: string | undefined | null): boolean {
  const t = (tipoVoto ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  return t.includes("artigo 17") || t.includes("art. 17");
}

/** Follow `links[rel=next]` pagination, yielding each page's `dados` array. */
async function* paginate<T>(firstUrl: string): AsyncGenerator<T[]> {
  let url: string | null = firstUrl;
  const visited = new Set<string>();
  while (url && !visited.has(url)) {
    visited.add(url);
    const page: CamaraPage<T> = await fetchJson<CamaraPage<T>>(url);
    yield Array.isArray(page.dados) ? page.dados : [];
    url = page.links?.find((l) => l.rel === "next")?.href ?? null;
    if (url) await sleep(REQUEST_DELAY);
  }
}

/** Extract a trailing numeric id from a Câmara resource URI. */
function idFromUri(uri: string | undefined | null): number | null {
  if (!uri) return null;
  const m = uri.match(/\/(\d+)\/?$/);
  return m ? Number(m[1]) : null;
}

/** Human-readable bill identifier, e.g. "PL 3085/2026". */
function billIdentifier(p: CamaraProposicaoRef): string | null {
  if (!p.siglaTipo || !p.numero || !p.ano) return null;
  return `${p.siglaTipo} ${p.numero}/${p.ano}`;
}

/** Public page for a bill on camara.leg.br. */
function billUrl(id: number): string {
  return `https://www.camara.leg.br/proposicoesWeb/fichadetramitacao?idProposicao=${id}`;
}

/** Fetch a single resource's `dados`, returning null on any failure. */
async function tryFetchDados<T>(path: string): Promise<T | null> {
  try {
    const res = await fetchJson<{ dados?: T }>(`${BASE}${path}`);
    return res.dados ?? null;
  } catch {
    return null;
  }
}

// ─── Parties ─────────────────────────────────────────────────────────────────

/**
 * Import every party with representation in the Câmara, enriching each with its
 * detail record (logo, website, leader, official head count).
 *
 * Returns nothing; use {@link partyIdsBySigla} to resolve links afterwards.
 */
export async function syncParties(opts: SyncOptions = {}): Promise<SyncResult> {
  const c = counters();
  const url = `${BASE}/partidos?ordem=ASC&ordenarPor=sigla&itens=100`;

  for await (const dados of paginate<CamaraPartido>(url)) {
    for (const p of dados) {
      // Return, not break: `break` would only end this page and keep paginating.
      if (opts.limit && c.seen >= opts.limit) {
        return { itemsSeen: c.seen, itemsUpserted: c.upserted };
      }
      c.seen++;
      if (p.id == null) continue;

      const detail = await tryFetchDados<CamaraPartidoDetalhe>(`/partidos/${p.id}`);
      await sleep(REQUEST_DELAY);

      const total = Number(detail?.status?.totalMembros);
      // Roughly half the published logo URLs 404; verify once here so the UI
      // renders its monogram fallback server-side instead of chasing a dead file.
      const logoUrl = await verifyImageUrl(detail?.urlLogo ?? p.urlLogo ?? null);
      await upsertParty({
        source: SOURCE,
        externalRef: String(p.id),
        name: detail?.nome ?? p.nome ?? p.sigla ?? `Partido ${p.id}`,
        acronym: detail?.sigla ?? p.sigla ?? null,
        logoUrl,
        websiteUrl: detail?.urlWebSite ?? null,
        leaderName: detail?.status?.lider?.nome ?? null,
        memberCount: Number.isFinite(total) ? total : null,
      });
      c.upserted++;
    }
  }

  const merged = await mergeDuplicateParties();
  if (merged > 0) {
    opts.onProgress?.({ seen: c.seen, upserted: c.upserted, note: `${merged} partido(s) duplicado(s) fundido(s)` });
  }

  return { itemsSeen: c.seen, itemsUpserted: c.upserted };
}

/** Map `party acronym → internal party id` for the Câmara-sourced parties. */
async function partyIdsBySigla(): Promise<Map<string, string>> {
  const parties = await db.party.findMany({
    where: { source: SOURCE },
    select: { id: true, acronym: true },
  });
  return new Map(
    parties
      .filter((p): p is { id: string; acronym: string } => Boolean(p.acronym))
      .map((p) => [p.acronym.toUpperCase(), p.id]),
  );
}

// ─── Deputies ────────────────────────────────────────────────────────────────

/**
 * Import the deputies currently in office, linking each to its party. Deputies
 * no longer listed are marked `inOffice: false` rather than deleted, so their
 * vote history — and the alignment index built from it — survives.
 */
export async function syncAgents(opts: SyncOptions = {}): Promise<SyncResult> {
  const c = counters();
  const partyBySigla = await partyIdsBySigla();
  const seenRefs: string[] = [];

  const url = `${BASE}/deputados?ordem=ASC&ordenarPor=nome&itens=100`;
  let truncated = false;

  outer: for await (const dados of paginate<CamaraDeputado>(url)) {
    for (const d of dados) {
      if (opts.limit && c.seen >= opts.limit) {
        truncated = true;
        break outer;
      }
      c.seen++;
      if (d.id == null) continue;

      const { firstName, lastName } = splitName(d.nome ?? "", "Deputado");
      let partyId: string | null = null;
      if (d.siglaPartido) {
        const key = d.siglaPartido.toUpperCase();
        // Fall back to creating the party so this job can run before (or without)
        // the party job — the party sync will fill in the details next cycle.
        partyId =
          partyBySigla.get(key) ??
          (await resolvePartyIdByAcronym(key, { source: SOURCE }));
        // `null` é rótulo que não é partido (ver `NOT_A_PARTY`): não entra no
        // cache, senão a próxima consulta acharia a chave e devolveria undefined.
        if (partyId) partyBySigla.set(key, partyId);
      }

      await upsertAgent({
        source: SOURCE,
        externalRef: String(d.id),
        firstName,
        lastName,
        type: AgentType.FEDERAL_DEPUTY,
        email: d.email ?? null,
        imageUrl: d.urlFoto ?? null,
        state: d.siglaUf ?? null,
        externalUrl: `https://www.camara.leg.br/deputados/${d.id}`,
        legislature: d.idLegislatura ?? null,
        inOffice: true,
        partyId,
      });
      seenRefs.push(String(d.id));
      c.upserted++;
    }
  }

  // A partial run (hit `limit`) must not retire the deputies it never looked at.
  if (!truncated) {
    await reconcileInOffice(SOURCE, AgentType.FEDERAL_DEPUTY, seenRefs);
  }
  await syncPartyAgentCounts();

  return { itemsSeen: c.seen, itemsUpserted: c.upserted };
}

// ─── Themes (bills under discussion) ─────────────────────────────────────────

/** Fetch a bill's official subject classification (`codTema` + `relevancia`). */
async function fetchClassifications(id: number): Promise<ThemeClassification[] | null> {
  try {
    const res = await fetchJson<{ dados?: CamaraTema[] }>(`${BASE}/proposicoes/${id}/temas`);
    const dados = Array.isArray(res.dados) ? res.dados : [];
    if (dados.length === 0) return null;
    return dados
      .filter((t) => t.codTema != null && t.tema)
      .map((t) => ({
        code: String(t.codTema),
        label: t.tema as string,
        relevance: Number(t.relevancia) === 1 ? 1 : 0,
      }));
  } catch {
    return null;
  }
}

/**
 * Resolve who proposed a bill.
 *
 * `/proposicoes/{id}/autores` returns the signatories in order, each with a
 * `uri` that points at `/deputados/{id}` for a parliamentarian and at
 * `/orgaos/{id}` for anything else (a committee, the Senate, the Executive).
 * The first entry flagged `proponente: 1` is the author of record; when that is
 * an órgão we keep its name as free text, since there is no agent to link to.
 */
async function fetchProposer(
  id: number,
  agentIdByRef: Map<string, string>,
): Promise<{ proposerId: string | null; proposerName: string | null }> {
  const autores = await tryFetchDados<CamaraAutor[]>(`/proposicoes/${id}/autores`);
  await sleep(REQUEST_DELAY);
  if (!Array.isArray(autores) || autores.length === 0) {
    return { proposerId: null, proposerName: null };
  }

  const author = autores.find((a) => Number(a.proponente) === 1) ?? autores[0];
  const name = author.nome?.trim() || null;

  // Only `/deputados/{id}` URIs identify a parliamentarian we can link to.
  if (!author.uri?.includes("/deputados/")) {
    return { proposerId: null, proposerName: name };
  }
  const deputyId = idFromUri(author.uri);
  if (deputyId == null) return { proposerId: null, proposerName: name };

  // Link only to a deputy we already imported; a bill authored by someone
  // outside the current roster keeps the plain name rather than fabricating one.
  const agentId = agentIdByRef.get(String(deputyId)) ?? null;
  return { proposerId: agentId, proposerName: agentId ? null : name };
}

/**
 * Upsert one bill as a Theme, resolving its detail (regime/urgency, situation,
 * keywords) and official classification. Returns the internal theme id, or null
 * when the bill can't be resolved.
 *
 * `skipDetail` short-circuits the extra requests when the caller already knows
 * the theme exists and only needs its id (the votes step, mid-run).
 */
async function upsertBillTheme(
  id: number,
  ref: CamaraProposicaoRef | null,
  c: Counters,
  agentIdByRef: Map<string, string>,
): Promise<string | null> {
  const prop = await tryFetchDados<CamaraProposicao>(`/proposicoes/${id}`);
  await sleep(REQUEST_DELAY);
  const bill: CamaraProposicaoRef & Partial<CamaraProposicao> = prop ?? ref ?? {};
  if (!prop && !ref) return null;

  const status = prop?.statusProposicao;
  const identifier = billIdentifier(bill) ?? `Proposição ${id}`;
  const situation = status?.descricaoSituacao ?? null;
  const urgency = status?.regime ?? null;
  const lastActionAt = parseDate(status?.dataHora);
  const inProgress = !isConcludedSituation(situation);

  // The subject taxonomy costs an extra request per bill and only feeds filters
  // and badges on the themes list — which never shows concluded bills. Over a
  // six-month backfill that skip is thousands of requests saved for data nobody
  // would read.
  const classifications = inProgress ? await fetchClassifications(id) : null;
  if (inProgress) await sleep(REQUEST_DELAY);

  // Authorship is only worth a request for bills still in play — a concluded
  // bill is never surfaced with an author card.
  //
  // `agentIdByRef` is a REQUIRED parameter, and that is the point: while it was
  // optional this branch read `inProgress && agentIdByRef`, so a call site that
  // forgot the map skipped authorship silently — the bill was still written,
  // with its situation, regime and classification intact, and only the author
  // and the rapporteur missing. Nothing ever came back for it, because
  // `upsertTheme` maps null to `undefined` so as not to wipe an author it could
  // not resolve. `npm run reauthor` is the repair for the themes left that way.
  const { proposerId, proposerName } = inProgress
    ? await fetchProposer(id, agentIdByRef)
    : { proposerId: null, proposerName: null };
  // `uriUltimoRelator` is already in the detail we fetched — no extra request.
  const rapporteurRef = idFromUri(status?.uriUltimoRelator);
  const rapporteurId =
    rapporteurRef != null ? agentIdByRef.get(String(rapporteurRef)) ?? null : null;

  const themeId = await upsertTheme({
    source: SOURCE,
    externalRef: String(id),
    name: billTitle(identifier, bill.ementa),
    summary: bill.ementa ?? "",
    scope: Scope.NATIONAL,
    house: House.CAMARA,
    identifier,
    externalUrl: billUrl(id),
    situation,
    urgency,
    keywords: prop?.keywords ?? null,
    presentedAt: parseDate(prop?.dataApresentacao),
    lastActionAt,
    inProgress,
    classifications,
    proposerId,
    proposerName,
    rapporteurId,
    priority: computePriority({ urgency, situation, identifier, inProgress, lastActionAt }),
  });
  c.upserted++;

  if (prop?.urlInteiroTeor) {
    await upsertArticle({
      source: SOURCE,
      externalRef: `proposicao:${id}:inteiroteor`,
      themeId,
      originalUrl: billUrl(id),
      title: `Inteiro teor — ${identifier}`,
      downloadUrl: prop.urlInteiroTeor,
    });
  }

  return themeId;
}

/**
 * Import the policy bills that moved recently — the "pautas em discussão" feed.
 * Each is stored with its urgency regime, current situation and official subject
 * classification so the themes list can rank what is actually about to be voted.
 */
export async function syncThemes(opts: SyncOptions = {}): Promise<SyncResult> {
  const c = counters();
  const agentIdByRef = await deputyIdsByRef();
  const days = opts.days ?? 30;
  const from = isoDaysAgo(days);
  const types = POLICY_TYPES.map((t) => `siglaTipo=${t}`).join("&");

  // `dataInicio` on `proposicoes` filters by last-change date, which is exactly
  // the "what moved this week" feed a weekly worker wants.
  const url =
    `${BASE}/proposicoes?${types}&dataInicio=${from}` +
    `&ordem=DESC&ordenarPor=id&itens=100`;

  for await (const dados of paginate<CamaraProposicaoRef>(url)) {
    for (const p of dados) {
      if (opts.limit && c.seen >= opts.limit) {
        return { itemsSeen: c.seen, itemsUpserted: c.upserted, watermark: from };
      }
      if (p.id == null) continue;
      c.seen++;
      if (c.seen % PROGRESS_INTERVAL === 0) {
        opts.onProgress?.({ seen: c.seen, upserted: c.upserted, note: `${c.seen} proposições` });
      }
      await upsertBillTheme(p.id, p, c, agentIdByRef);
    }
  }

  return { itemsSeen: c.seen, itemsUpserted: c.upserted, watermark: from };
}

/**
 * Re-resolve authorship for bills already imported that carry none.
 *
 * The repair for a gap the importer cannot close on its own. `upsertTheme` maps
 * a null author to `undefined` so a failed lookup never wipes an author we
 * already had — the right call, but it also means a bill first written WITHOUT
 * an author keeps that hole until something touches it again, and the weekly
 * sweeps only revisit bills that moved in the last 30–90 days. A bill that has
 * been sitting "Pronta para Pauta" since before the gap therefore stays
 * anonymous forever, which is exactly the set the themes list ranks highest.
 *
 * Scoped to bills with NO accountable face at all — neither a linked
 * parliamentarian (`proposerId`) nor a free-text author (`proposerName`) — and
 * still in progress, because {@link upsertBillTheme} only resolves authorship
 * for those; a concluded bill would cost three requests to learn nothing. The
 * rapporteur rides along in the detail the same pass already fetches.
 *
 * Idempotent and interruptible: it re-runs {@link upsertBillTheme}, so a second
 * run only revisits what is still missing. Ordered by priority so a capped run
 * repairs what the citizen actually sees first.
 */
export async function repairAuthorship(opts: SyncOptions = {}): Promise<SyncResult> {
  const c = counters();
  const agentIdByRef = await deputyIdsByRef();

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
    const id = Number(theme.externalRef);
    if (!Number.isFinite(id)) continue;
    c.seen++;
    if (c.seen % PROGRESS_INTERVAL === 0) {
      opts.onProgress?.({
        seen: c.seen,
        upserted: c.upserted,
        note: `${c.seen}/${pending.length} proposições sem autoria`,
      });
    }
    await upsertBillTheme(id, null, c, agentIdByRef);
  }

  return { itemsSeen: c.seen, itemsUpserted: c.upserted };
}

// ─── Floor agenda (the curated "what matters now" feed) ──────────────────────

interface CamaraEvento {
  id?: number;
  dataHoraInicio?: string;
  descricaoTipo?: string;
}

interface CamaraItemPauta {
  proposicao_?: CamaraProposicaoRef;
}

/** A bill seen on the floor agenda, with the signals used to rank it. */
interface AgendaCandidate {
  id: number;
  ref: CamaraProposicaoRef;
  /** How many deliberative sessions it was tabled for. */
  appearances: number;
  /** Most recent session it appeared in. */
  lastSeenAt: number;
}

/**
 * Import the bills actually tabled for a floor vote in the window.
 *
 * This is the answer to "which proposições matter right now". The Câmara
 * publishes no relevance ranking and its `/proposicoes` endpoint **ignores**
 * `codSituacao` (a nonsense value returns the same 12k rows), so situation
 * cannot be filtered server-side. What can be read directly is the Plenário's
 * own agenda: `orgaos/180/eventos` → `eventos/{id}/pauta`. Over three months
 * that is ~200 bills for ~80 requests, against ~12,300 bills and ~25,000
 * requests for the same window via {@link syncThemes}.
 *
 * `opts.limit` keeps only the top N candidates, ranked by how often the floor
 * scheduled them and how recently — both cheap signals available before any
 * detail request, so a capped run really does fetch only N bills.
 */
/**
 * Whether a Plenário event is a sitting where bills are actually decided.
 *
 * Needs care: the Câmara publishes "Sessão Deliberativa" and "Sessão Não
 * Deliberativa Solene", and a plain `includes("Deliberativa")` matches BOTH —
 * the negation is a prefix of the thing being looked for. Over a 120-day window
 * that let 59 solemn sessions through against 36 real ones, each costing a
 * `/pauta` request that can only ever come back empty.
 */
export function isDeliberativeSession(descricaoTipo: string | undefined | null): boolean {
  const t = descricaoTipo ?? "";
  return t.includes("Deliberativa") && !t.includes("Não Deliberativa");
}

export async function syncAgendaThemes(opts: SyncOptions = {}): Promise<SyncResult> {
  const c = counters();
  const agentIdByRef = await deputyIdsByRef();
  const days = opts.days ?? 90;
  const to = new Date();
  const from = new Date(to);
  from.setDate(from.getDate() - days);

  const candidates = new Map<number, AgendaCandidate>();

  for (const window of dateWindows(from, to, MAX_VOTE_WINDOW_DAYS)) {
    const url =
      `${BASE}/orgaos/${PLENARY_ORG_ID}/eventos` +
      `?dataInicio=${window.start}&dataFim=${window.end}&itens=100`;

    for await (const eventos of paginate<CamaraEvento>(url)) {
      for (const evento of eventos) {
        if (evento.id == null) continue;
        // Solemn and non-deliberative sessions table nothing.
        if (!isDeliberativeSession(evento.descricaoTipo)) continue;

        const pauta = await tryFetchDados<CamaraItemPauta[]>(`/eventos/${evento.id}/pauta`);
        await sleep(REQUEST_DELAY);
        if (!Array.isArray(pauta)) continue;

        const sessionAt = parseDate(evento.dataHoraInicio)?.getTime() ?? 0;
        for (const item of pauta) {
          const p = item.proposicao_;
          if (p?.id == null || !p.siglaTipo) continue;
          // The agenda is full of procedural paperwork (REQ, RCP); keep policy.
          if (!isPolicyType(p.siglaTipo)) continue;

          const existing = candidates.get(p.id);
          if (existing) {
            existing.appearances++;
            existing.lastSeenAt = Math.max(existing.lastSeenAt, sessionAt);
          } else {
            candidates.set(p.id, { id: p.id, ref: p, appearances: 1, lastSeenAt: sessionAt });
          }
        }
      }
    }
  }

  const ranked = [...candidates.values()].sort(
    (a, b) => b.appearances - a.appearances || b.lastSeenAt - a.lastSeenAt,
  );
  const selected = opts.limit ? ranked.slice(0, opts.limit) : ranked;

  for (const candidate of selected) {
    c.seen++;
    if (c.seen % PROGRESS_INTERVAL === 0) {
      opts.onProgress?.({
        seen: c.seen,
        upserted: c.upserted,
        note: `${c.seen}/${selected.length} proposições em pauta`,
      });
    }
    await upsertBillTheme(candidate.id, candidate.ref, c, agentIdByRef);
  }

  return {
    itemsSeen: c.seen,
    itemsUpserted: c.upserted,
    watermark: to.toISOString().slice(0, 10),
  };
}

/** Whether a bill type carries policy rather than procedure. */
function isPolicyType(siglaTipo: string): boolean {
  return (POLICY_TYPES as readonly string[]).includes(siglaTipo.toUpperCase());
}

// ─── Votes ───────────────────────────────────────────────────────────────────

/**
 * Resolve the bill a votação decided. The list payload's `uriProposicaoObjeto`
 * is almost always null, so this falls back to the detail's `proposicoesAfetadas`
 * and finally to the votação id's own prefix (the id is `{billId}-{sequence}`).
 */
async function resolveVotedBill(
  votacaoId: string,
): Promise<{ id: number; ref: CamaraProposicaoRef | null } | null> {
  const detail = await tryFetchDados<CamaraVotacaoDetalhe>(
    `/votacoes/${encodeURIComponent(votacaoId)}`,
  );
  await sleep(REQUEST_DELAY);

  const affected = detail?.proposicoesAfetadas?.find((p) => p.id != null);
  if (affected?.id != null) return { id: affected.id, ref: affected };

  const fromUri = idFromUri(detail?.uriProposicaoObjeto);
  if (fromUri != null) return { id: fromUri, ref: null };

  const prefix = Number(votacaoId.split("-")[0]);
  return Number.isFinite(prefix) ? { id: prefix, ref: null } : null;
}

/**
 * Import the nominal (roll-call) votes cast on the floor in the look-back
 * window, together with the bills they decided.
 *
 * Scoped to the Plenário (see {@link PLENARY_ORG_ID}) and further filtered to
 * votações that actually returned votes, so symbolic decisions never create
 * themes nobody is on record about.
 */
export async function syncVotes(opts: SyncOptions = {}): Promise<SyncResult> {
  const c = counters();
  const days = opts.days ?? 30;
  const to = new Date();
  const from = new Date(to);
  from.setDate(from.getDate() - days);

  const agentIdByRef = await deputyIdsByRef();
  const themeIdByBill = new Map<number, string>();
  let processed = 0;

  for (const window of dateWindows(from, to, MAX_VOTE_WINDOW_DAYS)) {
    const url =
      `${BASE}/votacoes?idOrgao=${PLENARY_ORG_ID}` +
      `&dataInicio=${window.start}&dataFim=${window.end}` +
      `&ordem=DESC&ordenarPor=dataHoraRegistro&itens=100`;

    for await (const dados of paginate<CamaraVotacao>(url)) {
      for (const v of dados) {
        if (!v.id) continue;
        if (opts.limit && processed >= opts.limit) {
          return { itemsSeen: c.seen, itemsUpserted: c.upserted, watermark: window.end };
        }
        processed++;
        if (processed % PROGRESS_INTERVAL === 0) {
          opts.onProgress?.({
            seen: c.seen,
            upserted: c.upserted,
            note: `${processed} votações · janela ${window.start}..${window.end}`,
          });
        }

        const votos = await fetchVotos(v.id);
        if (votos.length === 0) continue; // Symbolic/committee vote — no roll call.
        c.seen += votos.length;

        const bill = await resolveVotedBill(v.id);
        if (!bill) continue;

        let themeId = themeIdByBill.get(bill.id);
        if (!themeId) {
          const resolved = await upsertBillTheme(bill.id, bill.ref, c, agentIdByRef);
          if (!resolved) continue;
          themeId = resolved;
          themeIdByBill.set(bill.id, themeId);
        }

        const occurredAt = parseDate(v.dataHoraRegistro ?? v.data);
        const orientation = await fetchOrientacoes(v.id);
        // `v.descricao` vem na resposta de LISTA — nenhuma requisição a mais.
        await recordVotos(v.id, themeId, votos, occurredAt, agentIdByRef, c, orientation, v.descricao);
      }
    }
  }

  return {
    itemsSeen: c.seen,
    itemsUpserted: c.upserted,
    watermark: to.toISOString().slice(0, 10),
  };
}

/**
 * Preencher `RollCall.description` no histórico já importado.
 *
 * Gêmeo em espírito de `repairAuthorship`: a coluna é nova e as votações já
 * estão gravadas, então o dado tem de ser pedido de novo à casa. A diferença é o
 * custo — a descrição vem na resposta de **lista**, então isto refaz só as
 * chamadas de lista e **nenhuma** das de detalhe, votos ou orientação. Um
 * backfill de sete anos custa aqui algumas dezenas de requisições, contra as
 * milhares que `syncVotes` custaria.
 *
 * Idempotente e interrompível: só toca linha cuja descrição ainda é NULL, então
 * uma segunda passada não escreve nada e uma interrupção não perde o que já foi
 * feito.
 */
export async function repairDescriptions(
  opts: SyncOptions & { dryRun?: boolean } = {},
): Promise<SyncResult> {
  const c = counters();
  const days = opts.days ?? 30;
  const to = new Date();
  const from = new Date(to);
  from.setDate(from.getDate() - days);

  for (const window of dateWindows(from, to, MAX_VOTE_WINDOW_DAYS)) {
    const url =
      `${BASE}/votacoes?idOrgao=${PLENARY_ORG_ID}` +
      `&dataInicio=${window.start}&dataFim=${window.end}` +
      `&ordem=DESC&ordenarPor=dataHoraRegistro&itens=100`;

    for await (const dados of paginate<CamaraVotacao>(url)) {
      for (const v of dados) {
        if (!v.id || !v.descricao) continue;
        c.seen++;
        if (opts.dryRun) continue;
        // `description: null` no filtro é o que torna a passada idempotente e
        // o que impede de sobrescrever uma descrição que a casa mudou depois.
        const { count } = await db.rollCall.updateMany({
          where: { source: SOURCE, externalRef: v.id, description: null },
          data: { description: v.descricao },
        });
        c.upserted += count;
      }
      opts.onProgress?.({ seen: c.seen, upserted: c.upserted });
    }
  }

  return {
    itemsSeen: c.seen,
    itemsUpserted: c.upserted,
    watermark: to.toISOString().slice(0, 10),
  };
}

/**
 * Quantas proposições um deputado apresentou em cada área de política (§3.4).
 *
 * ── Por que a leitura existe ────────────────────────────────────────────────
 *
 * Votar é reagir à pauta que a Mesa montou; **apresentar é escolha da pessoa**.
 * Medido em 24/08/2026, a distribuição de VOTOS por área varia ±5 pontos entre
 * os 623 deputados — praticamente a mesma para todos, porque é a pauta e não
 * eles. A distribuição de AUTORIA é o traço que sobra, e é o que responde "sobre
 * o que este parlamentar trabalha".
 *
 * ── Por que uma varredura própria, e não o que já está no banco ─────────────
 *
 * Porque o acervo importado é uma amostra **enviesada** do que a pessoa
 * protocolou: o importador puxa o que se MOVEU na janela e o que entrou na pauta
 * do Plenário. Medido: temos **14** projetos de Erika Kokay contra os **≥100**
 * que a Câmara publica desde 2023. Publicar um perfil de foco sobre 14%
 * selecionados por movimentação descreveria a pauta da Câmara filtrada por ela,
 * não os interesses dela — que é exatamente o erro que o §3.2 gastou uma
 * investigação inteira para não cometer.
 *
 * ── Por que é barato ────────────────────────────────────────────────────────
 *
 * Três propriedades da API compõem, e as três foram verificadas:
 *
 *  - `codTema` **aceita repetição e faz união** — 68 + 15 devolveu exatamente 83,
 *    então uma área inteira cabe numa requisição;
 *  - `codTema` **combina com** `idDeputadoAutor`;
 *  - `itens=1` mais o link `last` devolve **a contagem exata sem baixar nenhum
 *    projeto**.
 *
 * Dez requisições por deputado (nove áreas mais o total), ~5.100 no total, ~40
 * min. A alternativa óbvia — pedir `/proposicoes/{id}/temas` de cada projeto —
 * custaria dezenas de milhares.
 *
 * ── O que NÃO precisa de filtro aqui ────────────────────────────────────────
 *
 * As outorgas de radiodifusão, que dominariam `infraestrutura` na leitura de
 * concordância, não aparecem nesta: são de autoria do Executivo ou de comissão,
 * e `idDeputadoAutor` já as exclui. O filtro continua devendo, mas ao outro lado.
 */
export async function syncAuthorship(opts: SyncOptions = {}): Promise<SyncResult> {
  const c = counters();
  const deputies = await db.publicAgent.findMany({
    where: { source: SOURCE, type: AgentType.FEDERAL_DEPUTY, inOffice: true },
    select: { id: true, externalRef: true },
  });
  const targets = opts.limit ? deputies.slice(0, opts.limit) : deputies;

  // Mandato corrente, e não a carreira. É o recorte que o resto da plataforma
  // usa (governismo por mandato, coesão por mandato), e um parlamentar pode ter
  // mudado de foco entre legislaturas. Medido em Erika Kokay: a proporção quase
  // não muda (53% contra 50% em Direitos), mas o n cai de 596 para 111.
  const since = `${CURRENT_TERM.from}`;
  const types = POLICY_TYPES.map((t) => `siglaTipo=${t}`).join("&");

  for (const [i, dep] of targets.entries()) {
    if (!dep.externalRef) continue;
    if (i % PROGRESS_INTERVAL === 0) {
      opts.onProgress?.({ seen: c.seen, upserted: c.upserted, note: `${i}/${targets.length}` });
    }
    const base = `${BASE}/proposicoes?idDeputadoAutor=${dep.externalRef}&${types}&dataApresentacaoInicio=${since}`;
    const total = await countProposicoes(base);
    c.seen++;
    if (total === null) continue;

    const byArea: Record<string, number> = {};
    for (const { key } of POLICY_AREAS) {
      const codes = CAMARA_CODES_BY_AREA[key];
      if (!codes.length) continue;
      const n = await countProposicoes(`${base}&${codes.map((k: number) => `codTema=${k}`).join("&")}`);
      if (n !== null && n > 0) byArea[key] = n;
    }

    await db.publicAgent.update({
      where: { id: dep.id },
      data: {
        // `total` viaja com as fatias pela regra do §3.3: "40%" e "40% de 47
        // projetos" são afirmações diferentes.
        authorshipAreas: { total, byArea } as unknown as object,
        authorshipComputedAt: new Date(),
      },
    });
    c.upserted++;
  }

  return { itemsSeen: c.seen, itemsUpserted: c.upserted, watermark: new Date().toISOString().slice(0, 10) };
}

/**
 * A contagem de uma consulta de proposições, sem baixar os itens.
 *
 * Com `itens=1`, a última página **é** o total. Sem link `last` a resposta cabe
 * numa página só, e aí o tamanho de `dados` é a resposta — o que cobre o zero.
 *
 * `null` quando a consulta falhou: é diferente de zero, e gravar zero por uma
 * requisição perdida publicaria "não apresentou nada sobre saúde" sobre um erro
 * de rede.
 */
async function countProposicoes(url: string): Promise<number | null> {
  try {
    const page = await fetchJson<CamaraPage<unknown>>(`${url}&itens=1`);
    await sleep(REQUEST_DELAY);
    const last = page.links?.find((l) => l.rel === "last")?.href;
    if (last) {
      const n = Number(new URL(last).searchParams.get("pagina"));
      if (Number.isFinite(n)) return n;
    }
    return Array.isArray(page.dados) ? page.dados.length : 0;
  } catch {
    return null;
  }
}

/**
 * Orientação de bancada dos pseudo-blocos `Governo` e `Oposição` numa votação.
 *
 * A Câmara publica, em `/votacoes/{id}/orientacoes`, o que cada bancada pediu
 * aos seus — e junto das siglas reais aparecem quatro pseudo-blocos: `Governo`,
 * `Oposição`, `Maioria` e `Minoria`. São eles que dizem onde estava a linha
 * governo↔oposição naquela votação.
 *
 * Isso não é um detalhe de completude. A primeira dimensão recuperada das
 * votações nominais brasileiras é essa linha, não esquerda↔direita (Zucco &
 * Lauderdale, *LSQ* 36(3), 2011): medida sobre 87 votações de 2024–2025, ela
 * correlaciona −0,96 com governismo e +0,49 com a escala do Brazilian
 * Legislative Survey, e coloca o PSOL à direita do PSDB. Sem baixar esta
 * resposta não há como descontar a pauta do Executivo nem como rodar o teste que
 * impede o índice de posicionamento de publicar governismo com nome de
 * ideologia.
 *
 * Um pedido a mais por votação nominal — ~80 por ano na Câmara.
 */
async function fetchOrientacoes(
  votacaoId: string,
): Promise<{ government: VoteValue | null; opposition: VoteValue | null }> {
  try {
    const res = await fetchJson<{ dados?: CamaraOrientacao[] }>(
      `${BASE}/votacoes/${encodeURIComponent(votacaoId)}/orientacoes`,
    );
    await sleep(REQUEST_DELAY);
    const rows = Array.isArray(res.dados) ? res.dados : [];
    const bloc = (...names: string[]) =>
      rows.find((r) => names.includes(foldBloc(r.siglaPartidoBloco)))?.orientacaoVoto;
    return {
      government: mapOrientation(bloc("governo")),
      opposition: mapOrientation(bloc("oposicao")),
    };
  } catch {
    // Uma votação sem orientação publicada não é um erro: é uma votação em que
    // a bancada foi liberada, ou uma cuja orientação a casa não registrou.
    return { government: null, opposition: null };
  }
}


/** Fetch a votação's nominal votes, treating any failure as "no roll call". */
async function fetchVotos(votacaoId: string): Promise<CamaraVoto[]> {
  try {
    const res = await fetchJson<{ dados?: CamaraVoto[] }>(
      `${BASE}/votacoes/${encodeURIComponent(votacaoId)}/votos`,
    );
    await sleep(REQUEST_DELAY);
    return Array.isArray(res.dados) ? res.dados : [];
  } catch {
    return [];
  }
}

/** Map `deputy externalRef → internal agent id`, for vote attachment. */
async function deputyIdsByRef(): Promise<Map<string, string>> {
  const agents = await db.publicAgent.findMany({
    where: { source: SOURCE, type: AgentType.FEDERAL_DEPUTY },
    select: { id: true, externalRef: true },
  });
  return new Map(
    agents
      .filter((a): a is { id: string; externalRef: string } => Boolean(a.externalRef))
      .map((a) => [a.externalRef, a.id]),
  );
}

/**
 * Persist one votação's individual votes against a Theme, and the same sitting
 * into the attendance ledger.
 *
 * Two records from one response, because they answer different questions: the
 * `Vote` row is the deputy's standing position on the bill (what the alignment
 * index reads, one per theme), while the `RollCall` row is the sitting itself
 * (what the quality index counts, one per votação). See {@link recordRollCall}.
 */
async function recordVotos(
  votacaoId: string,
  themeId: string,
  votos: CamaraVoto[],
  occurredAt: Date | null,
  agentIdByRef: Map<string, string>,
  c: Counters,
  orientation: { government: VoteValue | null; opposition: VoteValue | null } = {
    government: null,
    opposition: null,
  },
  description?: string | null,
): Promise<void> {
  const participants: Array<{ agentId: string; value: VoteValue }> = [];
  let presidingAgentId: string | null = null;

  for (const voto of votos) {
    const dep = voto.deputado_;
    if (!dep?.id) continue;
    const value = mapVote(voto.tipoVoto);
    // The chair is present but barred from voting. Caught before the `null`
    // guard below, because `mapVote` correctly reports "no position" and that
    // is exactly what would otherwise read as an absence.
    if (value === null) {
      if (isPresidingVote(voto.tipoVoto)) {
        presidingAgentId = agentIdByRef.get(String(dep.id)) ?? presidingAgentId;
      }
      continue;
    }

    const ref = String(dep.id);
    let agentId = agentIdByRef.get(ref);
    if (!agentId) {
      // A roll call can surface a deputy the roster no longer lists (a substitute
      // who has since stepped down). Record them as a past member so their vote
      // still counts toward the theme's tally.
      const { firstName, lastName } = splitName(dep.nome ?? "", "Deputado");
      agentId = await upsertAgent({
        source: SOURCE,
        externalRef: ref,
        firstName,
        lastName,
        type: AgentType.FEDERAL_DEPUTY,
        state: dep.siglaUf ?? null,
        imageUrl: dep.urlFoto ?? null,
        externalUrl: `https://www.camara.leg.br/deputados/${dep.id}`,
        legislature: dep.idLegislatura ?? null,
        inOffice: false,
      });
      agentIdByRef.set(ref, agentId);
    }

    participants.push({ agentId, value });

    const changed = await upsertAgentVote({
      source: SOURCE,
      externalRef: `votacao:${votacaoId}:deputado:${ref}`,
      themeId,
      agentId,
      value,
      occurredAt: parseDate(voto.dataRegistroVoto) ?? occurredAt,
      sessionRef: votacaoId,
    });
    if (changed) c.upserted++;
  }

  // A sitting with no date cannot be placed inside a mandate window, so it
  // cannot serve as an attendance denominator — skip it rather than guess.
  if (occurredAt) {
    await recordRollCall({
      source: SOURCE,
      externalRef: votacaoId,
      house: House.CAMARA,
      occurredAt,
      themeId,
      participants,
      presidingAgentId,
      governmentPosition: orientation.government,
      oppositionPosition: orientation.opposition,
      description,
    });
  }
}

// ─── Quality index: mandate record and running cost (CLAUDE.md §3.3) ─────────

/**
 * Bill types counted as "projetos propostos".
 *
 * Narrower than {@link POLICY_TYPES} on purpose: MPV and PLV are the Executive's
 * instruments, not a deputy's initiative, so crediting them to whoever signs an
 * amendment would measure the wrong thing. Requerimentos are excluded outright —
 * one sampled deputy filed 31 of them against 4 bills in 2025, so counting them
 * would rank who fills the order paper rather than who legislates.
 */
const AUTHORED_TYPES = ["PL", "PLP", "PEC", "PDL"] as const;

/**
 * Legislature in progress (57 = 2023–2027).
 *
 * Only a fallback: `camara:mandate` records the real legislatures per year, and
 * the expense sweep uses those. This keeps a fresh install — where the mandate
 * job has not run yet — from collecting nothing at all.
 */
const CURRENT_LEGISLATURE = 57;

/** Calendar years the quality index looks back over — one full Câmara legislature. */
export const QUALITY_WINDOW_YEARS = 4;

interface CamaraLegislatura {
  id?: number;
  dataInicio?: string;
  dataFim?: string;
}

interface CamaraHistorico {
  dataHora?: string;
  idLegislatura?: number;
  situacao?: string | null;
  descricaoStatus?: string | null;
  condicaoEleitoral?: string | null;
}

/** The years covered by the index window, most recent last. */
export function windowYears(now: Date = new Date()): number[] {
  const end = now.getFullYear();
  return Array.from({ length: QUALITY_WINDOW_YEARS }, (_, i) => end - QUALITY_WINDOW_YEARS + 1 + i);
}

/**
 * Reconstruct a deputy's mandate timeline from the Câmara's status log.
 *
 * The Senado publishes ready-made intervals; the Câmara publishes an event log,
 * so the intervals have to be paired up here. Entries read
 * "Entrada - Posse de Eleito Titular", "Entrada - Reassunção",
 * "Saída - Afastamento definitivo - Término da Legislatura",
 * "Saída - Afastamento sem prazo determinado - Secretário de Estado", plus
 * bookkeeping rows ("Alteração de partido") that move nobody in or out.
 *
 * Produces EXERCISE stretches (Entrada → the next Saída) and, for every exit
 * that is a leave rather than the end of a mandate, a LEAVE stretch covering the
 * gap until the deputy reassumes. The two are recorded separately because the
 * attendance pillar needs both: EXERCISE is its denominator, and LEAVE is what
 * tells it whether the agent was away long enough that the ratio stops meaning
 * anything at all.
 */
export function serviceSpansFromHistory(
  entries: CamaraHistorico[],
): Array<{ startsAt: Date; endsAt: Date | null; kind: ServiceKind; reason: string | null }> {
  const events = entries
    .map((e) => ({ at: parseDate(e.dataHora), status: e.descricaoStatus ?? "", situacao: e.situacao ?? "" }))
    .filter((e): e is { at: Date; status: string; situacao: string } => e.at !== null)
    .sort((a, b) => a.at.getTime() - b.at.getTime());

  const spans: Array<{ startsAt: Date; endsAt: Date | null; kind: ServiceKind; reason: string | null }> = [];
  let openExercise: Date | null = null;
  let openLeave: { at: Date; reason: string } | null = null;

  for (const e of events) {
    const isEntry = e.status.startsWith("Entrada") || e.situacao === "Exercício";
    const isExit = e.status.startsWith("Saída") || e.situacao === "FIM_MANDATO";

    if (isEntry) {
      if (openLeave) {
        spans.push({ startsAt: openLeave.at, endsAt: e.at, kind: ServiceKind.LEAVE, reason: openLeave.reason });
        openLeave = null;
      }
      openExercise ??= e.at;
      continue;
    }

    if (isExit) {
      if (openExercise) {
        spans.push({ startsAt: openExercise, endsAt: e.at, kind: ServiceKind.EXERCISE, reason: null });
        openExercise = null;
      }
      // "Término da Legislatura" is the mandate ending, not an absence from one:
      // the seat is gone, so there is nothing to be excused from.
      const definitive = /Término da Legislatura/i.test(e.status) || e.situacao === "FIM_MANDATO";
      if (!definitive) openLeave = { at: e.at, reason: leaveReason(e.status) };
    }
  }

  // Whatever is still open runs to today.
  if (openExercise) spans.push({ startsAt: openExercise, endsAt: null, kind: ServiceKind.EXERCISE, reason: null });
  if (openLeave) spans.push({ startsAt: openLeave.at, endsAt: null, kind: ServiceKind.LEAVE, reason: openLeave.reason });

  return spans;
}

/** "Saída - Afastamento sem prazo determinado - Secretário de Estado" → "Secretário de Estado". */
function leaveReason(status: string): string {
  const parts = status.split(" - ");
  return (parts[parts.length - 1] || status).trim();
}

/**
 * Import every sitting deputy's mandate record: the exercise/leave timeline, the
 * legislatures they served, and the substantive bills they authored and reported.
 *
 * Rapporteurship is counted from our own `Theme.rapporteurId` rather than from an
 * endpoint, because the Câmara publishes only `statusProposicao.uriUltimoRelator`
 * — a bill's *last* rapporteur, so the count is a floor by construction. That is
 * acceptable only because the quality index ranks deputies against deputies: a
 * floor that applies uniformly to a cohort does not disturb the ordering inside
 * it. It is never compared against the Senado's count, which is complete.
 */
export async function syncMandate(opts: SyncOptions = {}): Promise<SyncResult> {
  const c = counters();
  const years = windowYears();

  const legislatures = await fetchLegislatures();
  const deputies = await db.publicAgent.findMany({
    where: { source: SOURCE, type: AgentType.FEDERAL_DEPUTY, inOffice: true },
    select: { id: true, externalRef: true },
  });
  const targets = opts.limit ? deputies.slice(0, opts.limit) : deputies;
  const rapporteured = await rapporteurCountsByYear(targets.map((d) => d.id));

  for (const [i, dep] of targets.entries()) {
    if (!dep.externalRef) continue;
    c.seen++;
    if (i % PROGRESS_INTERVAL === 0) {
      opts.onProgress?.({ seen: c.seen, upserted: c.upserted, note: `${i}/${targets.length} deputados` });
    }

    const spans = serviceSpansFromHistory(await fetchHistory(dep.externalRef));
    for (const span of spans) {
      await upsertServiceSpan({
        source: SOURCE,
        externalRef: `camara:hist:${dep.externalRef}:${span.kind}:${span.startsAt.toISOString().slice(0, 10)}`,
        agentId: dep.id,
        ...span,
      });
    }

    const authored = await fetchAuthoredByYear(dep.externalRef, years);
    const legByYear = legislaturesByYear(legislatures, years);

    for (const year of years) {
      await upsertAgentMetrics(
        dep.id,
        year,
        {
          billsAuthored: authored.get(year) ?? 0,
          billsRapporteured: rapporteured.get(dep.id)?.get(year) ?? 0,
          legislatures: legByYear.get(year) ?? [],
        },
        SOURCE,
      );
    }
    c.upserted++;
  }

  return { itemsSeen: c.seen, itemsUpserted: c.upserted, watermark: new Date().toISOString().slice(0, 10) };
}

/** All legislatures with their date ranges, for mapping a year onto legislature ids. */
async function fetchLegislatures(): Promise<CamaraLegislatura[]> {
  const out: CamaraLegislatura[] = [];
  for await (const page of paginate<CamaraLegislatura>(
    `${BASE}/legislaturas?ordem=DESC&ordenarPor=id&itens=20`,
  )) {
    out.push(...page);
    if (out.length >= 20) break;
  }
  return out;
}

/**
 * Which legislature ids each year belongs to.
 *
 * An election year spans two: legislature 56 ran to 2023-01-31 and 57 opened on
 * 2023-02-01, and the Câmara's expense endpoint keys on `(idLegislatura, ano)` —
 * so querying 2023 under only one of them silently loses a month of documents.
 */
function legislaturesByYear(
  legislatures: CamaraLegislatura[],
  years: number[],
): Map<number, number[]> {
  const out = new Map<number, number[]>();
  for (const year of years) {
    const ids = legislatures
      .filter((l) => {
        if (!l.id || !l.dataInicio) return false;
        const start = Number(l.dataInicio.slice(0, 4));
        const end = l.dataFim ? Number(l.dataFim.slice(0, 4)) : 9999;
        return year >= start && year <= end;
      })
      .map((l) => l.id as number);
    out.set(year, ids);
  }
  return out;
}

/** A deputy's status log, tolerating the endpoint being unavailable. */
async function fetchHistory(deputyRef: string): Promise<CamaraHistorico[]> {
  try {
    const res = await fetchJson<{ dados?: CamaraHistorico[] }>(
      `${BASE}/deputados/${encodeURIComponent(deputyRef)}/historico`,
    );
    await sleep(REQUEST_DELAY);
    return Array.isArray(res.dados) ? res.dados : [];
  } catch {
    return [];
  }
}

/**
 * Count substantive bills the deputy authored, by year.
 *
 * One paginated request covers the whole window: the endpoint accepts repeated
 * `siglaTipo` and `ano` parameters, and the per-year totals were verified to
 * match querying each year separately.
 */
async function fetchAuthoredByYear(deputyRef: string, years: number[]): Promise<Map<number, number>> {
  const types = AUTHORED_TYPES.map((t) => `siglaTipo=${t}`).join("&");
  const anos = years.map((y) => `ano=${y}`).join("&");
  const url =
    `${BASE}/proposicoes?idDeputadoAutor=${encodeURIComponent(deputyRef)}` +
    `&${types}&${anos}&ordem=ASC&ordenarPor=id&itens=100`;

  const counts = new Map<number, number>();
  try {
    for await (const page of paginate<CamaraProposicao>(url)) {
      for (const p of page) {
        if (typeof p.ano !== "number") continue;
        counts.set(p.ano, (counts.get(p.ano) ?? 0) + 1);
      }
    }
  } catch {
    return counts;
  }
  return counts;
}

/** Bills each deputy is on record as rapporteur for, by year of last action. */
async function rapporteurCountsByYear(agentIds: string[]): Promise<Map<string, Map<number, number>>> {
  const themes = await db.theme.findMany({
    where: { rapporteurId: { in: agentIds } },
    select: { rapporteurId: true, presentedAt: true, lastActionAt: true },
  });
  const out = new Map<string, Map<number, number>>();
  for (const t of themes) {
    if (!t.rapporteurId) continue;
    const at = t.lastActionAt ?? t.presentedAt;
    if (!at) continue;
    const byYear = out.get(t.rapporteurId) ?? new Map<number, number>();
    const year = at.getFullYear();
    byYear.set(year, (byYear.get(year) ?? 0) + 1);
    out.set(t.rapporteurId, byYear);
  }
  return out;
}

interface CamaraDespesa {
  ano?: number;
  mes?: number;
  tipoDespesa?: string;
  valorLiquido?: number;
  valorDocumento?: number;
  valorGlosa?: number;
}

/**
 * Import the parliamentary quota (CEAP) each deputy drew — the running cost of
 * the mandate, and the fourth pillar of the quality index.
 *
 * What this measures, and what it deliberately does not: CEAP reimburses office
 * upkeep, travel, fuel, food, publicity and security — what a mandate consumes
 * to operate. Emendas parlamentares do not pass through it, which is the whole
 * reason it is the right source: a deputy who secured a billion reais for
 * schools in their state is not an expensive deputy, and an index that confused
 * the two would say the opposite of the truth (CLAUDE.md §3.3).
 *
 * Two quirks of the endpoint, both verified and both silent failures:
 *
 *   - **`idLegislatura` is required.** Without it the response is `200 OK` with
 *     an empty array — indistinguishable from a deputy who spent nothing.
 *   - **`ano` is required too.** With `idLegislatura` alone, only the first year
 *     of the legislature comes back (legislature 56 returned 100 rows, all 2019).
 *
 * So the sweep is over the product `(legislature × year)`, which is also why
 * `AgentMetrics.legislatures` exists: an election year belongs to two.
 *
 * Self-limiting on re-runs. A closed year whose figures are already stored is
 * skipped, so the first execution backfills the window and every later one costs
 * only the current year.
 */
export async function syncExpenses(opts: SyncOptions = {}): Promise<SyncResult> {
  const c = counters();
  const years = windowYears();
  const currentYear = new Date().getFullYear();

  const deputies = await db.publicAgent.findMany({
    where: { source: SOURCE, type: AgentType.FEDERAL_DEPUTY, inOffice: true },
    select: { id: true, externalRef: true },
  });
  const targets = opts.limit ? deputies.slice(0, opts.limit) : deputies;

  const stored = await db.agentMetrics.findMany({
    where: { agentId: { in: targets.map((d) => d.id) }, year: { in: years } },
    select: { agentId: true, year: true, quotaDocuments: true, legislatures: true },
  });
  const settled = new Set(
    stored.filter((m) => m.year < currentYear && m.quotaDocuments > 0).map((m) => `${m.agentId}:${m.year}`),
  );
  const legsByAgentYear = new Map(stored.map((m) => [`${m.agentId}:${m.year}`, m.legislatures]));

  for (const [i, dep] of targets.entries()) {
    if (!dep.externalRef) continue;
    if (i % PROGRESS_INTERVAL === 0) {
      opts.onProgress?.({ seen: c.seen, upserted: c.upserted, note: `${i}/${targets.length} deputados` });
    }

    for (const year of years) {
      const key = `${dep.id}:${year}`;
      if (settled.has(key)) continue;

      // `camara:mandate` writes the legislatures; if it has not run yet, fall
      // back to the current one so a fresh install still collects something.
      const legs = legsByAgentYear.get(key)?.length ? (legsByAgentYear.get(key) as number[]) : [CURRENT_LEGISLATURE];

      let spent = 0;
      let documents = 0;
      const byCategory = new Map<string, number>();

      for (const leg of legs) {
        for await (const page of paginate<CamaraDespesa>(
          `${BASE}/deputados/${encodeURIComponent(dep.externalRef)}/despesas` +
            `?idLegislatura=${leg}&ano=${year}&itens=100`,
        )) {
          for (const d of page) {
            const net = typeof d.valorLiquido === "number" ? d.valorLiquido : 0;
            if (net <= 0) continue;
            spent += net;
            documents++;
            const label = (d.tipoDespesa ?? "OUTROS").trim();
            byCategory.set(label, (byCategory.get(label) ?? 0) + net);
          }
        }
      }

      c.seen += documents;
      if (documents === 0) continue;

      await upsertAgentMetrics(
        dep.id,
        year,
        {
          quotaSpent: round2(spent),
          quotaDocuments: documents,
          quotaByCategory: Object.fromEntries(
            [...byCategory.entries()].map(([k, v]) => [k, round2(v)]),
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
