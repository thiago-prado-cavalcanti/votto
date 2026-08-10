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
  type Counters,
  type SyncOptions,
  type SyncResult,
  type ThemeClassification,
} from "@/lib/integration/importer";
import { computePriority, isConcludedSituation } from "@/lib/domain/priority";
import { db } from "@/lib/db";
import { AgentType, House, ImportSource, Scope, VoteValue } from "@/generated/prisma";

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

/** Walk a dotted path through nested objects, tolerating missing levels. */
function dig(root: unknown, path: string): unknown {
  let cur: unknown = root;
  for (const key of path.split(".")) {
    cur = obj(cur)[key];
    if (cur === undefined) return undefined;
  }
  return cur;
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
  const nameByAcronym = await partyNames();

  const acronyms = new Set<string>();
  for (const senator of await fetchSenators()) {
    const sigla = senator.partyAcronym;
    if (sigla) acronyms.add(sigla.toUpperCase());
  }

  for (const acronym of acronyms) {
    if (opts.limit && c.seen >= opts.limit) break;
    c.seen++;
    await resolvePartyId(acronym, nameByAcronym.get(acronym));
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
async function partyNames(): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  const list = await tryFetch(`/composicao/lista/partidos`);
  await sleep(REQUEST_DELAY);
  for (const p of arr(dig(list, "ListaPartidos.Partidos.Partido"))) {
    const sigla = str(obj(p).Sigla);
    const nome = str(obj(p).Nome);
    if (sigla && nome) names.set(sigla.toUpperCase(), nome);
  }
  return names;
}

/**
 * Resolve the internal Party id for an acronym, reusing a party already imported
 * by any source (typically the Câmara) so each party exists exactly once.
 */
function resolvePartyId(acronym: string, name?: string): Promise<string> {
  return resolvePartyIdByAcronym(acronym, { source: SOURCE, name });
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
      imageUrl: str(ident.UrlFotoParlamentar),
      email: str(ident.EmailParlamentar),
      profileUrl: str(ident.UrlPaginaParlamentar),
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
  const nameByAcronym = await partyNames();
  const partyCache = new Map<string, string>();
  const seenRefs: string[] = [];

  for (const s of senators) {
    if (opts.limit && c.seen >= opts.limit) break;
    c.seen++;

    let partyId: string | null = null;
    if (s.partyAcronym) {
      const key = s.partyAcronym.toUpperCase();
      partyId = partyCache.get(key) ?? (await resolvePartyId(key, nameByAcronym.get(key)));
      partyCache.set(key, partyId);
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
  agentIdByRef?: Map<string, string>,
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
  const proposerId = authorCode != null ? agentIdByRef?.get(String(authorCode)) ?? null : null;
  const proposerName = proposerId ? null : author?.autor?.trim() || null;

  // The rapporteur needs its own call, so only for bills still in play.
  const rapporteurId =
    inProgress && processId != null && agentIdByRef
      ? await fetchRapporteur(processId, agentIdByRef)
      : null;

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
export async function syncVotes(opts: SyncOptions = {}): Promise<SyncResult> {
  const c = counters();
  const days = opts.days ?? 30;
  const to = new Date();
  const from = new Date(to);
  from.setDate(from.getDate() - days);

  const start = from.toISOString().slice(0, 10);
  const end = to.toISOString().slice(0, 10);

  const votacoes = await tryFetch<SenadoVotacao[]>(
    `/votacao?dataInicio=${start}&dataFim=${end}`,
  );
  await sleep(REQUEST_DELAY);
  if (!Array.isArray(votacoes)) {
    return { itemsSeen: 0, itemsUpserted: 0, watermark: end };
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

    for (const voto of votos) {
      if (voto.codigoParlamentar == null) continue;
      const value = mapVote(voto.siglaVotoParlamentar);
      if (value === null) continue;
      c.seen++;

      const code = String(voto.codigoParlamentar);
      let agentId = agentIdByRef.get(code);
      if (!agentId) {
        // A roll call can reference a senator no longer in exercise (a substitute
        // who has since stepped down); record them as a past member.
        agentId = await upsertPastSenator(voto, partyCache);
        agentIdByRef.set(code, agentId);
      }

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
    partyId = partyCache.get(key) ?? (await resolvePartyId(key, key));
    partyCache.set(key, partyId);
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
