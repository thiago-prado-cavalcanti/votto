/**
 * Shared importer infrastructure for official-source integrations
 * (Câmara dos Deputados, Senado Federal).
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
import {
  AgentType,
  ImportSource,
  Scope,
  VoteValue,
  VoterType,
  type Prisma,
} from "@/generated/prisma";

// ─── Importer contract ───────────────────────────────────────────────────────

/** Options accepted by every importer run. */
export interface ImportOptions {
  /** Look-back window in days for time-bounded resources (votes, matérias). */
  days?: number;
  /** Soft cap on the number of primary records processed (for quick test runs). */
  limit?: number;
}

/** Aggregate counters returned by an importer run. */
export interface ImportResult {
  itemsSeen: number;
  itemsUpserted: number;
}

/**
 * Common interface implemented by each official-source importer. `source`
 * identifies the provenance written on every imported record.
 */
export interface Importer {
  source: ImportSource;
  run(opts: ImportOptions): Promise<ImportResult>;
}

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

// ─── Idempotent upsert helpers ───────────────────────────────────────────────

/** Input for {@link upsertParty}. */
export interface PartyInput {
  source: ImportSource;
  externalRef: string;
  name: string;
  acronym?: string | null;
  description?: string | null;
  logoUrl?: string | null;
}

/**
 * Idempotently upsert a Party by `(source, externalRef)`. Returns the internal
 * id (never exposed externally) so callers can link agents to it.
 */
export async function upsertParty(input: PartyInput): Promise<string> {
  const { source, externalRef, name, acronym, description, logoUrl } = input;
  const party = await db.party.upsert({
    where: { source_externalRef: { source, externalRef } },
    create: {
      kid: kid("pty"),
      name,
      acronym: acronym ?? undefined,
      description: description ?? undefined,
      logoUrl: logoUrl ?? undefined,
      source,
      externalRef,
    },
    update: {
      name,
      acronym: acronym ?? undefined,
      description: description ?? undefined,
      logoUrl: logoUrl ?? undefined,
    },
    select: { id: true },
  });
  return party.id;
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
  /** Internal party id (already resolved via {@link upsertParty}). */
  partyId?: string | null;
}

/**
 * Idempotently upsert a PublicAgent by `(source, externalRef)`. Returns the
 * internal id so callers can attach votes.
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
    partyId,
  } = input;

  const agent = await db.publicAgent.upsert({
    where: { source_externalRef: { source, externalRef } },
    create: {
      kid: kid("agt"),
      firstName,
      lastName,
      type,
      email: email ?? undefined,
      phone: phone ?? undefined,
      imageUrl: imageUrl ?? undefined,
      description: description ?? undefined,
      state: state ?? undefined,
      municipality: municipality ?? undefined,
      partyId: partyId ?? undefined,
      source,
      externalRef,
    },
    update: {
      firstName,
      lastName,
      type,
      email: email ?? undefined,
      phone: phone ?? undefined,
      imageUrl: imageUrl ?? undefined,
      description: description ?? undefined,
      state: state ?? undefined,
      municipality: municipality ?? undefined,
      partyId: partyId ?? undefined,
    },
    select: { id: true },
  });
  return agent.id;
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
}

/**
 * Idempotently upsert a Theme by `(source, externalRef)`. Vote tallies are NOT
 * touched here — they are maintained incrementally by {@link upsertAgentVote}.
 * Returns the internal id.
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
  } = input;

  const theme = await db.theme.upsert({
    where: { source_externalRef: { source, externalRef } },
    create: {
      kid: kid("thm"),
      name,
      summary: summary ?? "",
      scope,
      state: state ?? undefined,
      municipality: municipality ?? undefined,
      dimensions: dimensions ?? undefined,
      source,
      externalRef,
    },
    update: {
      name,
      summary: summary ?? "",
      scope,
      state: state ?? undefined,
      municipality: municipality ?? undefined,
      ...(dimensions !== undefined ? { dimensions } : {}),
    },
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
}

/**
 * Idempotently upsert an AGENT vote by `(source, externalRef)` and keep the
 * parent Theme's denormalized tallies (yes/no/abs) consistent.
 *
 * Tally maintenance is delta-based: on first insert the new value's counter is
 * incremented; if a re-run changes an existing vote's value, the old counter is
 * decremented and the new one incremented. Wrapped in a transaction so the vote
 * and the tally never drift apart.
 */
export async function upsertAgentVote(input: AgentVoteInput): Promise<void> {
  const { source, externalRef, themeId, agentId, value } = input;

  await db.$transaction(async (tx) => {
    const existing = await tx.vote.findUnique({
      where: { source_externalRef: { source, externalRef } },
      select: { id: true, value: true },
    });

    if (!existing) {
      await tx.vote.create({
        data: {
          value,
          voterType: VoterType.AGENT,
          themeId,
          agentId,
          source,
          externalRef,
        },
      });
      await tx.theme.update({
        where: { id: themeId },
        data: tallyDelta(undefined, value),
      });
      return;
    }

    if (existing.value !== value) {
      await tx.vote.update({
        where: { id: existing.id },
        data: { value },
      });
      await tx.theme.update({
        where: { id: themeId },
        data: tallyDelta(existing.value, value),
      });
    }
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
 * Recount a Party's `agentCount` from its current agents. Cheap and exact;
 * called at the end of an import so the denormalized count never drifts.
 */
export async function syncPartyAgentCounts(source: ImportSource): Promise<void> {
  const parties = await db.party.findMany({
    where: { source },
    select: { id: true },
  });
  for (const p of parties) {
    const count = await db.publicAgent.count({ where: { partyId: p.id } });
    await db.party.update({ where: { id: p.id }, data: { agentCount: count } });
  }
}

// ─── Run orchestration ───────────────────────────────────────────────────────

/**
 * Execute an importer while recording an ImportRun row around it. Failures are
 * caught: the run is marked `ok: false` with the error note, and the error is
 * re-thrown so the CLI can exit non-zero. Always returns the final counts via
 * throw/return semantics handled by the caller.
 */
export async function runImport(
  importer: Importer,
  opts: ImportOptions = {},
): Promise<ImportResult> {
  const run = await db.importRun.create({
    data: { source: importer.source, itemsSeen: 0, itemsUpserted: 0, ok: false },
    select: { id: true },
  });

  try {
    const result = await importer.run(opts);
    await db.importRun.update({
      where: { id: run.id },
      data: {
        finishedAt: new Date(),
        itemsSeen: result.itemsSeen,
        itemsUpserted: result.itemsUpserted,
        ok: true,
        note: `Importação concluída (${importer.source}).`,
      },
    });
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db.importRun.update({
      where: { id: run.id },
      data: {
        finishedAt: new Date(),
        ok: false,
        note: `Falha: ${message}`.slice(0, 500),
      },
    });
    throw err;
  }
}
