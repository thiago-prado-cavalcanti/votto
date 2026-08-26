/**
 * Shared importer infrastructure for official-source integrations
 * (Câmara dos Deputados, Senado Federal — CLAUDE.md §8).
 *
 * Everything here is provenance-aware and idempotent: records are upserted on the
 * compound unique key `(source, externalRef)` so re-running an import never
 * duplicates rows. A public `kid` is assigned only on first insert (in the
 * `create` branch of each upsert) and is left untouched on updates.
 *
 * Also exposes a small HTTP helper (`fetchJson`) with timeout, retry/backoff and
 * a polite inter-request delay so we behave well against public APIs.
 */
import { db } from "@/lib/db";
import { kid } from "@/lib/ids";
import { partyLogoPath } from "@/lib/integration/party-logos";
import {
  AgentType,
  House,
  ImportSource,
  Scope,
  ServiceKind,
  VoteValue,
  VoterType,
  type Prisma,
} from "@/generated/prisma";

// ─── Sync step contract ──────────────────────────────────────────────────────

/** Progress heartbeat emitted during long imports. */
export interface SyncProgress {
  seen: number;
  upserted: number;
  /** What the step is working on right now, e.g. "janela 2026-05-16..2026-08-08". */
  note?: string;
}

/** Options accepted by every sync step. */
export interface SyncOptions {
  /** Look-back window in days for time-bounded resources (votes, bills). */
  days?: number;
  /** Soft cap on the number of primary records processed (for quick test runs). */
  limit?: number;
  /**
   * Called periodically during long imports so a CLI can show it is alive. A
   * six-month backfill runs for over an hour; without this it would print
   * nothing between "started" and "finished".
   */
  onProgress?: (progress: SyncProgress) => void;
}

/** How many primary records between {@link SyncOptions.onProgress} calls. */
export const PROGRESS_INTERVAL = 25;

/** Mutable counters threaded through a sync step. */
export interface Counters {
  seen: number;
  upserted: number;
}

/** Create a zeroed counter bag. */
export function counters(): Counters {
  return { seen: 0, upserted: 0 };
}

/** Aggregate counts returned by a sync step. */
export interface SyncResult {
  itemsSeen: number;
  itemsUpserted: number;
  /** Optional cursor persisted on the SyncJob for the next incremental run. */
  watermark?: string;
}

/** One unit of synchronization (agents, parties, themes or votes of a source). */
export type SyncStep = (opts: SyncOptions) => Promise<SyncResult>;

// ─── HTTP helper ─────────────────────────────────────────────────────────────

/** Tunables for {@link fetchJson}. */
export interface FetchOptions {
  /** Extra request headers (e.g. `Accept: application/json`). */
  headers?: Record<string, string>;
  /** Per-attempt timeout in milliseconds. Default 20000. */
  timeoutMs?: number;
  /** Number of retries on network error / 5xx / 429. Default 3. */
  retries?: number;
  /** Base backoff in milliseconds (grows exponentially). Default 600. */
  backoffMs?: number;
}

/** Pause execution for `ms` milliseconds. */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetch a URL and parse it as JSON, with timeout, exponential backoff retry and
 * polite handling of rate limiting. Throws after exhausting retries.
 */
export async function fetchJson<T = unknown>(
  url: string,
  opts: FetchOptions = {},
): Promise<T> {
  const { headers = {}, timeoutMs = 20000, retries = 3, backoffMs = 600 } = opts;

  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        headers: { Accept: "application/json", "User-Agent": "VottoBot/1.0", ...headers },
        signal: controller.signal,
        redirect: "follow",
      });
      clearTimeout(timer);

      // Retry on transient server errors and rate limiting.
      if (res.status === 429 || res.status >= 500) {
        throw new Error(`HTTP ${res.status} for ${url}`);
      }
      if (!res.ok) {
        // Non-retryable client error: surface immediately.
        throw new Error(`HTTP ${res.status} for ${url} (non-retryable)`);
      }
      return (await res.json()) as T;
    } catch (err) {
      clearTimeout(timer);
      lastError = err;
      const isNonRetryable =
        err instanceof Error && err.message.includes("non-retryable");
      if (isNonRetryable || attempt === retries) break;
      await sleep(backoffMs * Math.pow(2, attempt));
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error(`Failed to fetch ${url}`);
}

// ─── Date helpers ────────────────────────────────────────────────────────────

/** `YYYY-MM-DD` for a date `days` in the past (0 = today). */
export function isoDaysAgo(days: number, from: Date = new Date()): string {
  const d = new Date(from);
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

/**
 * Parse a source-provided date/datetime string into a Date, tolerating the several
 * shapes the two houses emit (`2026-07-15`, `2026-07-15T14:00`, `2026-07-15T14:00:00.123`).
 * Returns null for missing or unparseable values rather than an Invalid Date.
 */
export function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value.length === 10 ? `${value}T00:00:00Z` : value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Split `[from, to]` into consecutive windows of at most `maxDays`. The Câmara
 * `votacoes` endpoint rejects ranges wider than three months, so any backfill
 * must be chunked.
 */
export function dateWindows(
  from: Date,
  to: Date,
  maxDays: number,
): Array<{ start: string; end: string }> {
  const windows: Array<{ start: string; end: string }> = [];
  const cursor = new Date(from);
  while (cursor <= to) {
    const end = new Date(cursor);
    end.setDate(end.getDate() + maxDays - 1);
    const clamped = end > to ? to : end;
    windows.push({
      start: cursor.toISOString().slice(0, 10),
      end: clamped.toISOString().slice(0, 10),
    });
    cursor.setDate(cursor.getDate() + maxDays);
  }
  return windows;
}

/** Split a full name into first + remaining as last name. */
export function splitName(
  full: string,
  fallbackFirst: string,
): { firstName: string; lastName: string } {
  const trimmed = (full ?? "").trim();
  if (!trimmed) return { firstName: fallbackFirst, lastName: "" };
  const parts = trimmed.split(/\s+/);
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

/** Longest theme title we build from a bill's ementa, in characters. */
const MAX_TITLE_LENGTH = 130;

/**
 * Human-readable title for an imported bill.
 *
 * The official identifier ("PL 3085/2026") is precise but means nothing to a
 * citizen scanning a list, so the ementa — the one-line statement of what the
 * bill does — becomes the title, trimmed at a word boundary. The identifier is
 * still stored in its own column, shown as a badge and searchable.
 *
 * Falls back to the identifier when the source gives no ementa.
 */
export function billTitle(identifier: string, summary: string | null | undefined): string {
  const text = (summary ?? "").replace(/\s+/g, " ").trim();
  if (!text) return identifier;
  if (text.length <= MAX_TITLE_LENGTH) return text;

  const cut = text.slice(0, MAX_TITLE_LENGTH);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > 60 ? cut.slice(0, lastSpace) : cut).replace(/[,;:.\s]+$/, "")}…`;
}

// ─── Idempotent upsert helpers ───────────────────────────────────────────────

/** Input for {@link upsertParty}. */
export interface PartyInput {
  source: ImportSource;
  externalRef: string;
  name: string;
  acronym?: string | null;
  description?: string | null;
  logoUrl?: string | null;
  leaderName?: string | null;
  websiteUrl?: string | null;
  /** The house's own head count for the party (may differ from our agentCount). */
  memberCount?: number | null;
}

/**
 * Idempotently upsert a Party by `(source, externalRef)`. Returns the internal
 * id (never exposed externally) so callers can link agents to it.
 */
export async function upsertParty(input: PartyInput): Promise<string> {
  const {
    source,
    externalRef,
    name,
    acronym,
    description,
    logoUrl,
    leaderName,
    websiteUrl,
    memberCount,
  } = input;

  // The curated mark wins over whatever the house published: the Câmara's GIF is
  // the acronym in plain type for most parties, and the Senado publishes none.
  // Applied here, at the one choke point every importer goes through, so a
  // re-import cannot quietly reinstate the source's version.
  const curatedLogo = partyLogoPath(acronym);

  const data = {
    name,
    acronym: acronym ?? undefined,
    description: description ?? undefined,
    logoUrl: curatedLogo ?? logoUrl ?? undefined,
    leaderName: leaderName ?? undefined,
    websiteUrl: websiteUrl ?? undefined,
    memberCount: memberCount ?? undefined,
  };

  const party = await db.party.upsert({
    where: { source_externalRef: { source, externalRef } },
    create: { kid: kid("pty"), ...data, source, externalRef },
    update: data,
    select: { id: true },
  });
  return party.id;
}

/**
 * Check that a URL actually serves an image, returning null when it does not.
 *
 * The Câmara publishes a `urlLogo` for every party by formula
 * (`.../partidos/{SIGLA}.gif`), but only about half of those files exist — 10 of
 * 22 answer 404, including PL, MDB and REPUBLICANOS. Storing a known-dead URL
 * means every page render asks the browser to fetch it and fall back, so the
 * check happens once at import instead.
 *
 * Any network trouble is treated as "keep the URL": a transient failure must not
 * silently strip working logos from the database.
 */
export async function verifyImageUrl(url: string | null | undefined): Promise<string | null> {
  if (!url) return null;
  try {
    const res = await fetch(url, {
      method: "HEAD",
      signal: AbortSignal.timeout(10_000),
      redirect: "follow",
    });
    if (res.status === 404 || res.status === 410) return null;
    if (!res.ok) return url;
    const type = res.headers.get("content-type") ?? "";
    return type.startsWith("image/") ? url : null;
  } catch {
    return url;
  }
}

/**
 * Rótulos que as casas põem no campo do partido e que não são partido nenhum.
 * Comparados sem espaços nem pontos, em caixa alta.
 */
const NOT_A_PARTY = new Set([
  "S/PARTIDO",
  "SEMPARTIDO",
  "S/PART",
  "SPARTIDO",
  "NAOINFORMADO",
  "-",
]);

/** Lowercase alphanumerics only — for comparing names across sources. */
function foldName(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/**
 * Resolve the internal Party id for an acronym, reusing a party already imported
 * by ANY source so each party exists exactly once — otherwise "PT" would appear
 * twice on the parties page, once from the Câmara and once from the Senado.
 * Only creates a record when the party is genuinely new, which also lets the
 * agent jobs run before (or without) their party job.
 *
 * Matching is by acronym first, then by name. The two houses do not always agree
 * on the abbreviation — the Câmara writes `PODE` where the Senado writes
 * `PODEMOS` — but they do agree on the full name ("Podemos"), so the name is the
 * reliable tiebreaker. Passing `name` is therefore worth it wherever it is known.
 *
 * Returns `null` for a label that is not a party. The houses put the *absence*
 * of a party in the same field as the party — the Senado publishes `S/PARTIDO`
 * for an unaffiliated senator — and taking that at face value created a Party
 * row called "S/PARTIDO" that then appeared on `/partidos` like an organisation,
 * accumulating every unaffiliated member as if they were a bench. Guarded here,
 * at the single choke point both houses go through, for the same reason the
 * curated logo is applied here: a per-importer check is a check that one of them
 * will be missing.
 */
export async function resolvePartyIdByAcronym(
  acronym: string,
  fallback: { source: ImportSource; name?: string },
): Promise<string | null> {
  const normalized = acronym.trim().toUpperCase();
  if (NOT_A_PARTY.has(normalized.replace(/[\s.]/g, ""))) return null;

  const byAcronym = await db.party.findFirst({
    where: { acronym: { equals: normalized, mode: "insensitive" } },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });
  if (byAcronym) return byAcronym.id;

  // Only worth querying when the caller knows a name distinct from the acronym.
  if (fallback.name && foldName(fallback.name) !== foldName(normalized)) {
    const candidates = await db.party.findMany({
      select: { id: true, name: true },
      orderBy: { createdAt: "asc" },
    });
    const target = foldName(fallback.name);
    const byName = candidates.find((p) => foldName(p.name) === target);
    if (byName) return byName.id;
  }

  return upsertParty({
    source: fallback.source,
    externalRef: `partido:${normalized}`,
    name: fallback.name ?? normalized,
    acronym: normalized,
  });
}

/**
 * Collapse parties that are the same party under different abbreviations,
 * keeping the oldest record and moving every agent onto it.
 *
 * Self-healing rather than a one-off fix: the houses can diverge on an
 * abbreviation at any time (they already do for Podemos), and a duplicate only
 * becomes visible as a second, near-empty card on the parties page. Runs at the
 * end of each party sync. Returns how many rows were merged away.
 */
export async function mergeDuplicateParties(): Promise<number> {
  const parties = await db.party.findMany({
    select: { id: true, name: true, acronym: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });

  const groups = new Map<string, typeof parties>();
  for (const party of parties) {
    const key = foldName(party.name);
    if (!key) continue;
    const group = groups.get(key);
    if (group) group.push(party);
    else groups.set(key, [party]);
  }

  let merged = 0;
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    // Oldest wins: it is the one the public `kid` links already point at.
    const [survivor, ...duplicates] = group;
    for (const duplicate of duplicates) {
      await db.publicAgent.updateMany({
        where: { partyId: duplicate.id },
        data: { partyId: survivor.id },
      });
      await db.party.delete({ where: { id: duplicate.id } });
      merged++;
    }
  }

  // The survivor just absorbed the duplicate's members; without this its
  // denormalized count would stay stale until the next agent import.
  if (merged > 0) await syncPartyAgentCounts();
  return merged;
}

/** Input for {@link upsertAgent}. */
export interface AgentInput {
  source: ImportSource;
  externalRef: string;
  firstName: string;
  lastName: string;
  type: AgentType;
  email?: string | null;
  phone?: string | null;
  imageUrl?: string | null;
  description?: string | null;
  state?: string | null;
  municipality?: string | null;
  externalUrl?: string | null;
  inOffice?: boolean;
  legislature?: number | null;
  /** Internal party id (already resolved via {@link upsertParty}). */
  partyId?: string | null;
}

/**
 * Idempotently upsert a PublicAgent by `(source, externalRef)`. Returns the
 * internal id so callers can attach votes.
 *
 * CPF is deliberately NOT imported even though the Câmara publishes it: we keep
 * citizen-grade PII to the minimum the product actually needs (CLAUDE.md §5),
 * and agent identity is already established by the source's own id.
 */
export async function upsertAgent(input: AgentInput): Promise<string> {
  const {
    source,
    externalRef,
    firstName,
    lastName,
    type,
    email,
    phone,
    imageUrl,
    description,
    state,
    municipality,
    externalUrl,
    inOffice,
    legislature,
    partyId,
  } = input;

  const data = {
    firstName,
    lastName,
    type,
    email: email ?? undefined,
    phone: phone ?? undefined,
    imageUrl: imageUrl ?? undefined,
    description: description ?? undefined,
    state: state ?? undefined,
    municipality: municipality ?? undefined,
    externalUrl: externalUrl ?? undefined,
    legislature: legislature ?? undefined,
    partyId: partyId ?? undefined,
    ...(inOffice === undefined ? {} : { inOffice }),
  };

  const agent = await db.publicAgent.upsert({
    where: { source_externalRef: { source, externalRef } },
    create: { kid: kid("agt"), ...data, source, externalRef },
    update: data,
    select: { id: true },
  });
  return agent.id;
}

/** One official subject classification attached to a theme. */
export interface ThemeClassification {
  /** Source-native code (Câmara `codTema`, Senado `classificacoes[].codigo`). */
  code: string;
  label: string;
  /** Full hierarchy path, when the source provides one (Senado). */
  hierarchy?: string;
  /** 1 = the source flags this as the bill's main subject. */
  relevance: number;
}

/** Input for {@link upsertTheme}. */
export interface ThemeInput {
  source: ImportSource;
  externalRef: string;
  name: string;
  summary?: string;
  scope?: Scope;
  state?: string | null;
  municipality?: string | null;
  dimensions?: Prisma.InputJsonValue;
  identifier?: string | null;
  house?: House | null;
  externalUrl?: string | null;
  situation?: string | null;
  urgency?: string | null;
  priority?: number;
  classifications?: ThemeClassification[] | null;
  keywords?: string | null;
  inProgress?: boolean;
  presentedAt?: Date | null;
  lastActionAt?: Date | null;
  /** Internal agent id of the proposing parliamentarian, when there is one. */
  proposerId?: string | null;
  /** Author name when the author is not a parliamentarian (committee, Executive). */
  proposerName?: string | null;
  /** Internal agent id of the current rapporteur. */
  rapporteurId?: string | null;
}

/**
 * Idempotently upsert a Theme by `(source, externalRef)`. Vote tallies are NOT
 * touched here — they are maintained incrementally by {@link upsertAgentVote}.
 * Returns the internal id.
 *
 * `summary` is only written when the source provides a non-empty one, so a
 * metadata-only refresh never wipes an AI-enriched summary (CLAUDE.md §4).
 */
export async function upsertTheme(input: ThemeInput): Promise<string> {
  const {
    source,
    externalRef,
    name,
    summary,
    scope = Scope.NATIONAL,
    state,
    municipality,
    dimensions,
    identifier,
    house,
    externalUrl,
    situation,
    urgency,
    priority,
    classifications,
    keywords,
    inProgress,
    presentedAt,
    lastActionAt,
    proposerId,
    proposerName,
    rapporteurId,
  } = input;

  const data = {
    name,
    scope,
    state: state ?? undefined,
    municipality: municipality ?? undefined,
    identifier: identifier ?? undefined,
    house: house ?? undefined,
    externalUrl: externalUrl ?? undefined,
    situation: situation ?? undefined,
    urgency: urgency ?? undefined,
    keywords: keywords ?? undefined,
    presentedAt: presentedAt ?? undefined,
    lastActionAt: lastActionAt ?? undefined,
    proposerId: proposerId ?? undefined,
    proposerName: proposerName ?? undefined,
    rapporteurId: rapporteurId ?? undefined,
    ...(summary ? { summary } : {}),
    ...(priority === undefined ? {} : { priority }),
    ...(inProgress === undefined ? {} : { inProgress }),
    ...(dimensions === undefined ? {} : { dimensions }),
    ...(classifications === undefined || classifications === null
      ? {}
      : { classifications: classifications as unknown as Prisma.InputJsonValue }),
  };

  const theme = await db.theme.upsert({
    where: { source_externalRef: { source, externalRef } },
    create: { kid: kid("thm"), summary: summary ?? "", ...data, source, externalRef },
    update: data,
    select: { id: true },
  });
  return theme.id;
}

/** Input for {@link upsertArticle}. */
export interface ArticleInput {
  source: ImportSource;
  externalRef: string;
  /** Internal theme id (already resolved via {@link upsertTheme}). */
  themeId: string;
  originalUrl: string;
  title?: string | null;
  downloadUrl?: string | null;
}

/**
 * Idempotently upsert an Article by `(source, externalRef)`. Returns the
 * internal id.
 */
export async function upsertArticle(input: ArticleInput): Promise<string> {
  const { source, externalRef, themeId, originalUrl, title, downloadUrl } = input;
  const article = await db.article.upsert({
    where: { source_externalRef: { source, externalRef } },
    create: {
      kid: kid("art"),
      themeId,
      originalUrl,
      title: title ?? undefined,
      downloadUrl: downloadUrl ?? undefined,
      source,
      externalRef,
    },
    update: {
      originalUrl,
      title: title ?? undefined,
      downloadUrl: downloadUrl ?? undefined,
    },
    select: { id: true },
  });
  return article.id;
}

/** Input for {@link upsertAgentVote}. */
export interface AgentVoteInput {
  source: ImportSource;
  externalRef: string;
  /** Internal theme id. */
  themeId: string;
  /** Internal agent id. */
  agentId: string;
  value: VoteValue;
  /** When the roll call happened. */
  occurredAt?: Date | null;
  /** Source id of the roll call (internal use only). */
  sessionRef?: string | null;
}

/**
 * Idempotently upsert an AGENT vote by `(source, externalRef)` and keep the
 * parent Theme's denormalized tallies (yes/no/abs) consistent.
 *
 * Tally maintenance is delta-based: on first insert the new value's counter is
 * incremented; if a re-run changes an existing vote's value, the old counter is
 * decremented and the new one incremented. Wrapped in a transaction so the vote
 * and the tally never drift apart.
 *
 * An agent has at most one position per theme (`@@unique([agentId, themeId])`).
 * When a bill is voted more than once (e.g. the bill itself and later an
 * amendment), the newer roll call overwrites the older position instead of
 * failing the whole run.
 */
export async function upsertAgentVote(input: AgentVoteInput): Promise<boolean> {
  const { source, externalRef, themeId, agentId, value, occurredAt, sessionRef } = input;

  return db.$transaction(async (tx) => {
    const existing = await tx.vote.findUnique({
      where: { source_externalRef: { source, externalRef } },
      select: { id: true, value: true },
    });

    if (existing) {
      if (existing.value === value) return false;
      await tx.vote.update({
        where: { id: existing.id },
        data: { value, occurredAt: occurredAt ?? undefined, sessionRef: sessionRef ?? undefined },
      });
      await tx.theme.update({
        where: { id: themeId },
        data: tallyDelta(existing.value, value),
      });
      return true;
    }

    // A different roll call may already hold this agent's position on the theme.
    const priorPosition = await tx.vote.findUnique({
      where: { agentId_themeId: { agentId, themeId } },
      select: { id: true, value: true, occurredAt: true },
    });

    if (priorPosition) {
      // Keep the most recent roll call as the agent's standing position.
      const priorAt = priorPosition.occurredAt?.getTime() ?? 0;
      const newAt = occurredAt?.getTime() ?? 0;
      if (newAt < priorAt) return false;

      await tx.vote.update({
        where: { id: priorPosition.id },
        data: {
          value,
          occurredAt: occurredAt ?? undefined,
          sessionRef: sessionRef ?? undefined,
          source,
          externalRef,
        },
      });
      if (priorPosition.value !== value) {
        await tx.theme.update({
          where: { id: themeId },
          data: tallyDelta(priorPosition.value, value),
        });
      }
      return true;
    }

    await tx.vote.create({
      data: {
        value,
        voterType: VoterType.AGENT,
        themeId,
        agentId,
        occurredAt: occurredAt ?? undefined,
        sessionRef: sessionRef ?? undefined,
        source,
        externalRef,
      },
    });
    await tx.theme.update({
      where: { id: themeId },
      data: tallyDelta(undefined, value),
    });
    return true;
  });
}

/**
 * Build the Theme tally increment for transitioning a vote from `from`
 * (undefined when newly created) to `to`.
 */
function tallyDelta(
  from: VoteValue | undefined,
  to: VoteValue,
): Prisma.ThemeUpdateInput {
  const data: Prisma.ThemeUpdateInput = {};
  const dec = (v: VoteValue) => {
    if (v === VoteValue.YES) data.yesCount = { decrement: 1 };
    else if (v === VoteValue.NO) data.noCount = { decrement: 1 };
    else data.absCount = { decrement: 1 };
  };
  const inc = (v: VoteValue) => {
    if (v === VoteValue.YES) data.yesCount = { increment: 1 };
    else if (v === VoteValue.NO) data.noCount = { increment: 1 };
    else data.absCount = { increment: 1 };
  };
  if (from) dec(from);
  inc(to);
  return data;
}

/**
 * Record one nominal roll call and who took part in it — the attendance ledger
 * behind the quality index (CLAUDE.md §3.3).
 *
 * This is deliberately NOT derived from `Vote`. `Vote` is unique on
 * `(agentId, themeId)` and {@link upsertAgentVote} rewrites the row when a later
 * roll call touches the same bill, because what it holds is the agent's
 * *standing position* — which is exactly what the alignment index needs. The
 * side effect is that two roll calls on one bill collapse into a single row, so
 * counting `Vote` rows answers "how many bills does this agent have a position
 * on", never "how many sittings did they show up to". Relaxing that unique key
 * would break alignment to fix attendance; a ledger of its own breaks nothing.
 *
 * Costs no extra request: both houses' vote imports already download the full
 * participant list, and this persists what they were throwing away.
 *
 * Returns the number of participations written.
 */
export interface RollCallInput {
  source: ImportSource;
  /** Câmara `votacao.id`, Senado `codigoSessaoVotacao`. */
  externalRef: string;
  house: House;
  occurredAt: Date;
  /** The bill decided, when it resolves to a theme we track. */
  themeId?: string | null;
  participants: Array<{ agentId: string; value: VoteValue }>;
  /**
   * Whoever was in the chair, when the source names them. They are present but
   * barred from voting, so they belong in neither `participants` (no position)
   * nor the absentees (they were there) — see `RollCall.presidingAgentId`.
   */
  presidingAgentId?: string | null;
  /**
   * Orientação de bancada dos pseudo-blocos `Governo` e `Oposição`, quando a
   * casa as publica (Câmara `/votacoes/{id}/orientacoes`).
   *
   * Elas não dizem como ninguém votou — dizem o que a liderança pediu. É
   * exatamente isso que as torna o controle de que o índice de posicionamento
   * precisa: a primeira dimensão das votações nominais brasileiras é
   * governo↔oposição, e sem saber onde essa linha estava não há como afirmar que
   * um eixo econômico não é ela com outro nome (Zucco & Lauderdale 2011).
   *
   * `undefined` e `null` significam a mesma coisa aqui — não publicada — e é
   * diferente de bancada liberada, que também chega como null. As duas juntas
   * apenas dizem que essa votação não serve para medir contaminação.
   */
  governmentPosition?: VoteValue | null;
  oppositionPosition?: VoteValue | null;
  /**
   * Descrição da votação, como a casa a publica.
   *
   * `undefined` (ausente) e `null` significam coisas diferentes aqui, pela mesma
   * regra que `upsertTheme` aplica ao autor: ausente **não sobrescreve** o que já
   * está gravado. É o que permite `npm run redescribe` preencher o histórico sem
   * que o sync semanal, ou uma fonte que parou de publicar o campo, apague o que
   * ele preencheu.
   */
  description?: string | null;
}

export async function recordRollCall(input: RollCallInput): Promise<number> {
  const {
    source,
    externalRef,
    house,
    occurredAt,
    themeId,
    participants,
    presidingAgentId,
    governmentPosition,
    oppositionPosition,
    description,
  } = input;
  if (participants.length === 0) return 0;

  const orientation = {
    governmentPosition: governmentPosition ?? null,
    oppositionPosition: oppositionPosition ?? null,
  };

  const rollCall = await db.rollCall.upsert({
    where: { source_externalRef: { source, externalRef } },
    create: {
      source,
      externalRef,
      house,
      occurredAt,
      themeId: themeId ?? null,
      presidingAgentId: presidingAgentId ?? null,
      description: description ?? null,
      ...orientation,
    },
    update: {
      occurredAt,
      themeId: themeId ?? null,
      presidingAgentId: presidingAgentId ?? null,
      // Ausente não apaga: ver `RollCallInput.description`.
      description: description === undefined ? undefined : description,
      ...orientation,
    },
    select: { id: true },
  });

  // `skipDuplicates` rather than a per-row upsert: a sitting has ~500
  // participants, and the load-bearing fact here is presence, which cannot
  // change on re-import. A vote's *value* can be corrected by the source, but
  // `Vote` already carries the authoritative one — this column is for audit.
  const created = await db.rollCallVote.createMany({
    data: participants.map((p) => ({
      rollCallId: rollCall.id,
      agentId: p.agentId,
      value: p.value,
    })),
    skipDuplicates: true,
  });

  return created.count;
}

/**
 * Idempotently record one stretch of an agent's mandate — time in the seat
 * (EXERCISE) or an officially recorded absence (LEAVE).
 *
 * The attendance denominator is built from these: roll calls held inside an
 * EXERCISE stretch, minus those falling inside a LEAVE. Both houses publish the
 * information in different shapes — the Senado as ready intervals, the Câmara as
 * an event log that has to be paired up — so the importers converge here.
 */
export interface ServiceSpanInput {
  source: ImportSource;
  /** Stable key, e.g. `camara:hist:204379:2019-02-01`. */
  externalRef: string;
  agentId: string;
  startsAt: Date;
  /** Null while the stretch is still open. */
  endsAt?: Date | null;
  kind: ServiceKind;
  reason?: string | null;
}

export async function upsertServiceSpan(input: ServiceSpanInput): Promise<void> {
  const { source, externalRef, agentId, startsAt, endsAt, kind, reason } = input;
  const data = { agentId, startsAt, endsAt: endsAt ?? null, kind, reason: reason ?? null };
  await db.agentService.upsert({
    where: { source_externalRef: { source, externalRef } },
    create: { ...data, source, externalRef },
    update: data,
  });
}

/**
 * Merge a partial measurement into an agent's per-year metrics row.
 *
 * Several jobs own different columns of the same row — the mandate job writes
 * the bill counts, the expense job the quota, the recompute step the attendance
 * numerator and denominator — so this patches rather than replaces. Whichever
 * runs first creates the row.
 */
export type AgentMetricsPatch = Omit<
  Prisma.AgentMetricsUncheckedCreateInput,
  "id" | "agentId" | "year" | "source" | "createdAt" | "updatedAt"
>;

export async function upsertAgentMetrics(
  agentId: string,
  year: number,
  patch: AgentMetricsPatch,
  source: ImportSource = ImportSource.MANUAL,
): Promise<void> {
  await db.agentMetrics.upsert({
    where: { agentId_year: { agentId, year } },
    create: { agentId, year, source, ...patch },
    update: patch,
  });
}

/**
 * Mark every agent of `(source, type)` whose externalRef was NOT seen in this
 * run as no longer sitting, and re-mark the seen ones as sitting. Mandates end
 * and substitutes rotate; without this, a former deputy would keep appearing in
 * rankings forever. Votes are never deleted — the history is what the alignment
 * index is built from (CLAUDE.md §3.1).
 */
export async function reconcileInOffice(
  source: ImportSource,
  type: AgentType,
  seenRefs: string[],
): Promise<void> {
  // A run that returned nothing is far more likely to be an API outage than an
  // empty house — refuse to retire everyone on that basis.
  if (seenRefs.length === 0) return;

  await db.publicAgent.updateMany({
    where: { source, type, externalRef: { notIn: seenRefs }, inOffice: true },
    data: { inOffice: false },
  });
  await db.publicAgent.updateMany({
    where: { source, type, externalRef: { in: seenRefs }, inOffice: false },
    data: { inOffice: true },
  });
}

/**
 * Recount every party's `agentCount` from its currently sitting agents. Cheap and
 * exact; called at the end of an agent import so the denormalized count — which
 * dashboards and party cards read — never drifts.
 */
export async function syncPartyAgentCounts(): Promise<void> {
  const grouped = await db.publicAgent.groupBy({
    by: ["partyId"],
    where: { partyId: { not: null }, inOffice: true, status: "ACTIVE" },
    _count: { _all: true },
  });
  const counts = new Map(grouped.map((g) => [g.partyId as string, g._count._all]));

  const parties = await db.party.findMany({ select: { id: true, agentCount: true } });
  for (const p of parties) {
    const next = counts.get(p.id) ?? 0;
    if (next !== p.agentCount) {
      await db.party.update({ where: { id: p.id }, data: { agentCount: next } });
    }
  }
}

/**
 * Minúsculas sem acento — as siglas de bloco chegam como "Oposição".
 *
 * Compartilhada pelas duas casas porque as duas publicam orientação de bancada,
 * em serviços diferentes e com a mesma grafia acentuada.
 */
export function foldBloc(value: string | undefined): string {
  return (value ?? "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

/**
 * Mapear uma orientação de bancada nos nossos três valores.
 *
 * `Liberado` vira `null` de propósito, e a diferença é a que sustenta o
 * controle: uma bancada liberada é o governo dizendo que aquela votação **não**
 * é da linha governo↔oposição, e tratá-la como posição inverteria o sinal do
 * desconto.
 *
 * Uma definição só, para as duas casas: a regra do "Liberado" é a que decide o
 * denominador do governismo, e duas cópias dela seriam duas chances de as casas
 * contarem coisas diferentes sob o mesmo nome.
 */
export function mapOrientation(orientation: string | undefined): VoteValue | null {
  const t = foldBloc(orientation);
  if (t === "sim") return VoteValue.YES;
  if (t === "nao") return VoteValue.NO;
  return null;
}
