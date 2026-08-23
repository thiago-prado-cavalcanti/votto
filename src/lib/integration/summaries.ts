/**
 * The AI enrichment pass over imported themes, as a schedulable sync step.
 *
 * Picks the bills a citizen is most likely to see — highest priority, still in
 * progress, not yet enriched — and gives each a plain-language title and
 * summary plus the two positioning axes (see `src/lib/ai/summarize.ts`).
 *
 * Two rules keep this safe to re-run:
 *   * **Official text is never touched.** Only the `plain*` / `dimensions`
 *     columns are written; `name`, `summary` and `identifier` stay as imported.
 *   * **An editor always wins.** A theme whose `dimensionsSource` is `EDITOR`
 *     keeps its human tagging; only the plain-language fields are refreshed.
 *
 * Runs after the theme jobs so it enriches what they just brought in.
 */
import { summarizeTheme } from "@/lib/ai/summarize";
import { db } from "@/lib/db";
import { env, isAiEnabled } from "@/lib/env";
import {
  counters,
  PROGRESS_INTERVAL,
  sleep,
  type SyncOptions,
  type SyncResult,
} from "@/lib/integration/importer";
import type { Prisma } from "@/generated/prisma";

/** Themes enriched per run when the caller sets no limit. */
const DEFAULT_BATCH = 300;

/** Pause between calls, so a long run doesn't burst against the rate limit. */
const REQUEST_DELAY = 150;

/**
 * How long a theme the model could not summarize is left alone.
 *
 * Long enough that a permanently-unsummarizable bill costs one attempt a month
 * instead of one a week, short enough that a transient outage is not a permanent
 * exclusion.
 */
const RETRY_AFTER_MS = 30 * 24 * 60 * 60 * 1000;

/** Below this model-reported confidence the axes are dropped as noise. */
const MIN_AXIS_CONFIDENCE = 0.35;

/** Read the classification labels stored on a theme, for extra model context. */
function classificationLabels(value: Prisma.JsonValue | null): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) =>
      entry && typeof entry === "object" && typeof (entry as { label?: unknown }).label === "string"
        ? ((entry as { label: string }).label)
        : null,
    )
    .filter((label): label is string => Boolean(label));
}

/**
 * Enrich the highest-priority themes that have no plain-language summary yet.
 *
 * `opts.limit` caps how many are processed; without it the run takes the top
 * {@link DEFAULT_BATCH}. Ordering by priority means a partial run still covers
 * the bills closest to a vote.
 */
export async function syncSummaries(opts: SyncOptions = {}): Promise<SyncResult> {
  const c = counters();
  if (!isAiEnabled()) {
    // Not an error: the platform runs fine without AI, themes just keep the
    // official wording. Surfaced through the job's note.
    return { itemsSeen: 0, itemsUpserted: 0, watermark: "sem ANTHROPIC_API_KEY" };
  }

  const take = opts.limit ?? DEFAULT_BATCH;
  const retryAfter = new Date(Date.now() - RETRY_AFTER_MS);
  const themes = await db.theme.findMany({
    // `plainSummary: null` is what keeps a theme from being summarized twice.
    // The `aiUpdatedAt` clause is what keeps one that FAILED from being paid for
    // every week: without it a theme the model cannot produce a brief for stays
    // null, sits at the top of a priority ordering forever, and takes a slot in
    // every batch — so it is re-sent indefinitely and the themes below it are
    // never reached at all.
    where: {
      status: "ACTIVE",
      plainSummary: null,
      summary: { not: "" },
      OR: [{ aiUpdatedAt: null }, { aiUpdatedAt: { lt: retryAfter } }],
    },
    orderBy: [{ inProgress: "desc" }, { priority: "desc" }, { lastActionAt: "desc" }],
    take,
    select: {
      id: true,
      identifier: true,
      name: true,
      summary: true,
      keywords: true,
      classifications: true,
      dimensionsSource: true,
    },
  });

  for (const theme of themes) {
    c.seen++;
    if (c.seen % PROGRESS_INTERVAL === 0) {
      opts.onProgress?.({
        seen: c.seen,
        upserted: c.upserted,
        note: `${c.seen}/${themes.length} temas`,
      });
    }

    const brief = await summarizeTheme({
      identifier: theme.identifier,
      officialTitle: theme.name,
      officialSummary: theme.summary,
      keywords: theme.keywords,
      classifications: classificationLabels(theme.classifications),
    });
    await sleep(REQUEST_DELAY);

    if (!brief) {
      // Record the attempt, not a result. `aiUpdatedAt` therefore means "when
      // the AI last TRIED", which is what the selection above filters on — a
      // theme the model refuses is set aside for a month rather than re-sent
      // every run. It comes back on its own afterwards, in case the refusal was
      // about the model or the wording of the bill at the time.
      await db.theme.update({ where: { id: theme.id }, data: { aiUpdatedAt: new Date() } });
      continue;
    }

    // Axes are written only when the model is reasonably sure AND no editor has
    // tagged the theme. A low-confidence guess would pull every citizen's
    // position toward noise, which is worse than leaving the theme untagged.
    const acceptAxes =
      brief.confidence >= MIN_AXIS_CONFIDENCE && theme.dimensionsSource !== "EDITOR";

    await db.theme.update({
      where: { id: theme.id },
      data: {
        plainTitle: brief.plainTitle,
        plainSummary: brief.plainSummary,
        aiModel: env.anthropicSummaryModel,
        aiUpdatedAt: new Date(),
        ...(acceptAxes
          ? {
              dimensions: { economic: brief.economic, social: brief.social },
              dimensionsSource: "AI",
            }
          : {}),
      },
    });
    c.upserted++;
  }

  return { itemsSeen: c.seen, itemsUpserted: c.upserted };
}
