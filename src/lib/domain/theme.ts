/**
 * Shared theme domain helpers: vote tallies and the "temperature" index used to
 * surface hot themes (CLAUDE.md — Themes page).
 */
import "server-only";
import { db } from "@/lib/db";

/**
 * Recompute and persist a theme's denormalized vote tallies. Call after any vote
 * change so the public "temperature"/counters stay accurate.
 */
export async function recomputeThemeTallies(themeId: string): Promise<void> {
  const grouped = await db.vote.groupBy({
    by: ["value"],
    where: { themeId },
    _count: { _all: true },
  });
  let yes = 0;
  let no = 0;
  let abs = 0;
  for (const g of grouped) {
    if (g.value === "YES") yes = g._count._all;
    else if (g.value === "NO") no = g._count._all;
    else abs = g._count._all;
  }
  await db.theme.update({
    where: { id: themeId },
    data: { yesCount: yes, noCount: no, absCount: abs },
  });
}

/**
 * Temperature score (0–100) for ranking hot themes. Based on total engagement on
 * a log scale; a reference of ~5k votes reaches 100. Cheap and monotonic — good
 * enough for the MVP and easy to swap for a recency-weighted version later.
 */
export function themeTemperature(counts: {
  yesCount: number;
  noCount: number;
  absCount: number;
}): number {
  const total = counts.yesCount + counts.noCount + counts.absCount;
  if (total <= 0) return 0;
  const score = (Math.log10(total + 1) / Math.log10(5001)) * 100;
  return Math.max(0, Math.min(100, Math.round(score)));
}
