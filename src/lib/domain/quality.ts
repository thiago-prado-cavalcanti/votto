/**
 * Reading the stored quality index (CLAUDE.md §3.3).
 *
 * The maths lives in `src/lib/indexes/quality.ts` and the batch that runs it in
 * `src/lib/integration/quality.ts`; this is the thin query side, mirroring
 * `positioning.ts` ↔ `domain/positions.ts`.
 *
 * Nothing here recomputes. A percentile needs the whole cohort, so pages read
 * what the recompute step stored — which is also why the index is an indexed
 * column and lists can order by it in SQL.
 */
import "server-only";
import { db } from "@/lib/db";
import { EntityStatus } from "@/generated/prisma";
import { QUALITY_PILLARS, type QualityPillarResult } from "@/lib/indexes/quality";

/**
 * Parse the stored pillar breakdown.
 *
 * Defensive because the column is JSON written by an earlier version of the
 * pillar registry: a factor added or renamed since the last recompute must
 * degrade to "not measured" rather than crash a public page. Rows are returned
 * in registry order so the plate reads the same for every agent.
 */
export function parseQualityPillars(value: unknown): QualityPillarResult[] {
  const stored = new Map<string, Record<string, unknown>>();
  if (Array.isArray(value)) {
    for (const row of value) {
      if (row && typeof row === "object" && typeof (row as { key?: unknown }).key === "string") {
        stored.set((row as { key: string }).key, row as Record<string, unknown>);
      }
    }
  }

  return QUALITY_PILLARS.map((pillar) => {
    const row = stored.get(pillar.key);
    const score = typeof row?.score === "number" ? Math.round(row.score) : null;
    const reading =
      row?.reading && typeof row.reading === "object"
        ? (row.reading as { value?: unknown; detail?: unknown })
        : null;
    return {
      key: pillar.key,
      label: pillar.label,
      weight: pillar.weight,
      score,
      reading:
        reading && typeof reading.value === "string"
          ? {
              value: reading.value,
              detail: typeof reading.detail === "string" ? reading.detail : undefined,
            }
          : null,
    };
  });
}

/**
 * A party's quality reading: the mean of its sitting agents' scores.
 *
 * Averaging the composite rather than re-ranking the party against other
 * parties, which is how `citizenPartyAlignments` treats alignment — a party is
 * its members, and a bench of forty and a bench of two are not comparable as
 * ranked units.
 *
 * Agents without a score are left out entirely instead of counting as zero: a
 * party whose newest members cannot be measured yet is not a worse party.
 */
export async function partyQualityScores(): Promise<Map<string, number>> {
  const rows = await db.publicAgent.findMany({
    where: {
      status: EntityStatus.ACTIVE,
      inOffice: true,
      qualityScore: { not: null },
      partyId: { not: null },
    },
    select: { qualityScore: true, party: { select: { kid: true } } },
  });

  const sums = new Map<string, { sum: number; n: number }>();
  for (const row of rows) {
    const kid = row.party?.kid;
    if (!kid || row.qualityScore === null) continue;
    const bucket = sums.get(kid) ?? { sum: 0, n: 0 };
    bucket.sum += row.qualityScore;
    bucket.n++;
    sums.set(kid, bucket);
  }

  return new Map([...sums].map(([kid, b]) => [kid, Math.round(b.sum / b.n)]));
}
