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
  type Counters,
  type SyncOptions,
  type SyncResult,
  type ThemeClassification,
} from "@/lib/integration/importer";
import { computePriority, isConcludedSituation } from "@/lib/domain/priority";
import { db } from "@/lib/db";
import { AgentType, House, ImportSource, Scope, VoteValue } from "@/generated/prisma";

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
        partyBySigla.set(key, partyId);
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
  agentIdByRef?: Map<string, string>,
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
  const { proposerId, proposerName } = inProgress && agentIdByRef
    ? await fetchProposer(id, agentIdByRef)
    : { proposerId: null, proposerName: null };
  // `uriUltimoRelator` is already in the detail we fetched — no extra request.
  const rapporteurRef = idFromUri(status?.uriUltimoRelator);
  const rapporteurId =
    rapporteurRef != null ? agentIdByRef?.get(String(rapporteurRef)) ?? null : null;

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
        if (!(evento.descricaoTipo ?? "").includes("Deliberativa")) continue;

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
        await recordVotos(v.id, themeId, votos, occurredAt, agentIdByRef, c);
      }
    }
  }

  return {
    itemsSeen: c.seen,
    itemsUpserted: c.upserted,
    watermark: to.toISOString().slice(0, 10),
  };
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

/** Persist one votação's individual votes against a Theme. */
async function recordVotos(
  votacaoId: string,
  themeId: string,
  votos: CamaraVoto[],
  occurredAt: Date | null,
  agentIdByRef: Map<string, string>,
  c: Counters,
): Promise<void> {
  for (const voto of votos) {
    const dep = voto.deputado_;
    if (!dep?.id) continue;
    const value = mapVote(voto.tipoVoto);
    if (value === null) continue;

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
}
