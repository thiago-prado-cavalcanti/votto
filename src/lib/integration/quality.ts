/**
 * Recompute the quality index for every public agent (CLAUDE.md §3.3).
 *
 * This is a batch step, not a write-time one, and that is a real difference from
 * `Theme.priority`: a priority can be computed from the bill in front of you,
 * but a percentile cannot be computed from one agent — scoring anybody requires
 * the whole cohort's distribution. So the ranking runs once over everyone, after
 * the importers have filled `AgentMetrics`, `AgentService` and the roll-call
 * ledger.
 *
 * Reads only stored columns. That is what makes `npm run requality` possible:
 * re-tuning weights or band cut points is a recompute with no network, exactly
 * as `scripts/reprioritize.ts` is for priority.
 */
import { db } from "@/lib/db";
import { counters, type SyncOptions, type SyncResult } from "@/lib/integration/importer";
import { windowYears } from "@/lib/integration/camara";
import {
  computeQuality,
  isAdvancedSituation,
  relativeScore,
  QUALITY_PILLARS,
  type Quality,
  type QualityInputs,
} from "@/lib/indexes/quality";
import { AgentType, EntityStatus, House, ServiceKind } from "@/generated/prisma";

/**
 * Share of a house's sitting members that must have measurements before the
 * index is written for that house.
 *
 * A partial import does not produce partial results — it produces wrong ones.
 * Percentiles are computed against whoever happens to be present, so ranking
 * forty deputies out of five hundred would tell each of them they are in a
 * cohort they are not in. Below this, the run leaves the previous scores alone.
 */
const MIN_HOUSE_COVERAGE = 0.7;

/**
 * A pillar this heavy, measured for nobody in a house, blocks that house.
 *
 * The per-agent coverage floor answers "we could not measure *this* agent". It
 * cannot answer "we never loaded this pillar's data at all", because that looks
 * identical one agent at a time: every one of them redistributes the weight and
 * publishes a perfectly plausible score.
 *
 * It happened on the first production run. The roll-call ledger is filled by the
 * vote jobs, which already existed and had run within the week — so the worker's
 * catch-up, which only picks up jobs idle for over eight days, correctly skipped
 * them and the ledger stayed empty. Every agent then scored on three pillars,
 * publishing "87/100" while the heaviest component of that number was missing
 * and nothing on the page said so.
 *
 * Refusing is the same rule as {@link MIN_HOUSE_COVERAGE}: an index computed
 * from a different set of pillars is not a partial result, it is a different
 * index wearing the same name.
 */
const BLOCKING_PILLAR_WEIGHT = 0.25;

/** Average days per month, for turning a service span into a rate denominator. */
const DAYS_PER_MONTH = 30.44;

/** Region of each state, the fallback cohort when a UF has too few members. */
const REGION_BY_STATE: Record<string, string> = {
  AC: "N", AP: "N", AM: "N", PA: "N", RO: "N", RR: "N", TO: "N",
  AL: "NE", BA: "NE", CE: "NE", MA: "NE", PB: "NE", PE: "NE", PI: "NE", RN: "NE", SE: "NE",
  DF: "CO", GO: "CO", MT: "CO", MS: "CO",
  ES: "SE", MG: "SE", RJ: "SE", SP: "SE",
  PR: "S", RS: "S", SC: "S",
};

/** Half-open interval, `end === null` meaning "still open". */
interface Span {
  start: number;
  end: number | null;
}

function overlapDays(spans: Span[], from: number, to: number): number {
  // Union first: a leave can sit inside an exercise stretch, and two exercise
  // stretches can abut, so summing raw overlaps would double-count.
  const clipped = spans
    .map((s) => ({ start: Math.max(s.start, from), end: Math.min(s.end ?? to, to) }))
    .filter((s) => s.end > s.start)
    .sort((a, b) => a.start - b.start);

  let total = 0;
  let cursor = -Infinity;
  for (const s of clipped) {
    const start = Math.max(s.start, cursor);
    if (s.end > start) {
      total += s.end - start;
      cursor = s.end;
    }
  }
  return total / 86_400_000;
}

function covers(spans: Span[], at: number): boolean {
  return spans.some((s) => at >= s.start && (s.end === null || at <= s.end));
}

/** The house an agent belongs to, for cohorts and the roll-call ledger. */
function houseOf(type: AgentType): House | null {
  if (type === AgentType.FEDERAL_DEPUTY) return House.CAMARA;
  if (type === AgentType.SENATOR) return House.SENADO;
  return null;
}

interface AgentRow {
  id: string;
  house: House;
  state: string | null;
  inputs: QualityInputs;
}

/**
 * Recompute and store `PublicAgent.qualityScore` / `qualityPillars`.
 *
 * Returns one row per scored agent so callers can report a distribution —
 * `scripts/requality.ts` prints it, and a flat histogram is the signal that the
 * ranking is discriminating rather than clumping.
 */
export async function recomputeQualityIndex(
  opts: { dryRun?: boolean; onProgress?: SyncOptions["onProgress"] } = {},
): Promise<{
  scored: Array<{
    id: string;
    kid: string;
    name: string;
    score: number | null;
    pillars: Quality["pillars"];
  }>;
  skippedHouses: House[];
  /** Houses held back because a heavy pillar had no data at all, and which. */
  blockedBy: Map<House, string[]>;
}> {
  const years = windowYears();
  const from = Date.UTC(years[0], 0, 1);
  const to = Date.now();

  const agents = await db.publicAgent.findMany({
    where: {
      status: EntityStatus.ACTIVE,
      inOffice: true,
      type: { in: [AgentType.FEDERAL_DEPUTY, AgentType.SENATOR] },
    },
    select: { id: true, kid: true, firstName: true, lastName: true, type: true, state: true },
  });
  const agentIds = agents.map((a) => a.id);

  const [spans, rollCalls, attendance, metrics, advanced] = await Promise.all([
    db.agentService.findMany({
      where: { agentId: { in: agentIds } },
      select: { agentId: true, startsAt: true, endsAt: true, kind: true },
    }),
    db.rollCall.findMany({
      where: { occurredAt: { gte: new Date(from) } },
      select: { id: true, house: true, occurredAt: true, presidingAgentId: true },
    }),
    db.rollCallVote.findMany({
      where: { agentId: { in: agentIds }, rollCall: { occurredAt: { gte: new Date(from) } } },
      select: { agentId: true, rollCallId: true },
    }),
    db.agentMetrics.findMany({
      where: { agentId: { in: agentIds }, year: { in: years } },
    }),
    advancedBillCounts(agentIds),
  ]);

  const exerciseByAgent = new Map<string, Span[]>();
  const leaveByAgent = new Map<string, Span[]>();
  for (const s of spans) {
    const bucket = s.kind === ServiceKind.EXERCISE ? exerciseByAgent : leaveByAgent;
    const list = bucket.get(s.agentId) ?? [];
    list.push({ start: s.startsAt.getTime(), end: s.endsAt?.getTime() ?? null });
    bucket.set(s.agentId, list);
  }

  const attendedByAgent = new Map<string, Set<string>>();
  for (const a of attendance) {
    const set = attendedByAgent.get(a.agentId) ?? new Set<string>();
    set.add(a.rollCallId);
    attendedByAgent.set(a.agentId, set);
  }

  const rollCallsByHouse = new Map<
    House,
    Array<{ id: string; at: number; presidingAgentId: string | null }>
  >();
  for (const rc of rollCalls) {
    const list = rollCallsByHouse.get(rc.house) ?? [];
    list.push({ id: rc.id, at: rc.occurredAt.getTime(), presidingAgentId: rc.presidingAgentId });
    rollCallsByHouse.set(rc.house, list);
  }

  const metricsByAgent = new Map<string, typeof metrics>();
  for (const m of metrics) {
    const list = metricsByAgent.get(m.agentId) ?? [];
    list.push(m);
    metricsByAgent.set(m.agentId, list);
  }

  // ── Per-agent measurements ────────────────────────────────────────────────
  const rows: AgentRow[] = [];
  for (const agent of agents) {
    const house = houseOf(agent.type);
    if (!house) continue;

    const exercise = exerciseByAgent.get(agent.id) ?? [];
    const leave = leaveByAgent.get(agent.id) ?? [];
    const attended = attendedByAgent.get(agent.id) ?? new Set<string>();

    let eligible = 0;
    let attendedCount = 0;
    for (const rc of rollCallsByHouse.get(house) ?? []) {
      if (!covers(exercise, rc.at)) continue;
      if (covers(leave, rc.at)) continue;
      // Presiding is attendance, not absence: the rules bar the chair from
      // voting in an open ballot, so the sitting was never an opportunity they
      // failed to take. Out of the denominator, exactly like a day of official
      // leave — without this the Senate President read as the least assiduous
      // senator in the house while having been present at every sitting.
      if (rc.presidingAgentId === agent.id) continue;
      eligible++;
      if (attended.has(rc.id)) attendedCount++;
    }

    const daysInSeat = Math.max(0, overlapDays(exercise, from, to) - overlapDays(leave, from, to));
    const daysOnLeave = overlapDays(leave, from, to);
    const months = daysInSeat / DAYS_PER_MONTH;

    const mine = metricsByAgent.get(agent.id) ?? [];
    const authored = mine.reduce((sum, m) => sum + m.billsAuthored, 0);
    const rapporteured = mine.reduce((sum, m) => sum + m.billsRapporteured, 0);
    const spent = mine.reduce((sum, m) => sum + Number(m.quotaSpent), 0);
    const documents = mine.reduce((sum, m) => sum + m.quotaDocuments, 0);

    rows.push({
      id: agent.id,
      house,
      state: agent.state,
      inputs: {
        attendance:
          eligible > 0
            ? {
                eligible,
                attended: attendedCount,
                leaveShare: daysInSeat + daysOnLeave > 0 ? daysOnLeave / (daysInSeat + daysOnLeave) : 0,
              }
            : null,
        authorship: { authored, advanced: advanced.get(agent.id) ?? 0, months },
        rapporteurship: { count: rapporteured, months },
        cost: { spent, documents, months },
      },
    });

    // Store the derived attendance figures so the reading can be defended
    // against the ledger, and so a later re-tune has them without a re-import.
    if (!opts.dryRun) {
      const currentYear = new Date().getFullYear();
      await db.agentMetrics.upsert({
        where: { agentId_year: { agentId: agent.id, year: currentYear } },
        create: {
          agentId: agent.id,
          year: currentYear,
          rollCallsEligible: eligible,
          rollCallsAttended: attendedCount,
          daysInExercise: Math.round(daysInSeat),
          daysOnLeave: Math.round(daysOnLeave),
        },
        update: {
          rollCallsEligible: eligible,
          rollCallsAttended: attendedCount,
          daysInExercise: Math.round(daysInSeat),
          daysOnLeave: Math.round(daysOnLeave),
        },
      });
    }
  }

  // ── Cohort coverage gate ──────────────────────────────────────────────────
  const skippedHouses: House[] = [];
  const blockedBy = new Map<House, string[]>();
  const measurableHouses = new Set<House>();
  for (const house of [House.CAMARA, House.SENADO]) {
    const inHouse = rows.filter((r) => r.house === house);
    if (inHouse.length === 0) continue;

    const measured = inHouse.filter((r) =>
      QUALITY_PILLARS.some((p) => p.raw(r.inputs) !== null),
    ).length;

    // A heavy pillar nobody in the house could be measured on is missing data,
    // not missing agents — see BLOCKING_PILLAR_WEIGHT.
    const empty = QUALITY_PILLARS.filter(
      (p) => p.weight >= BLOCKING_PILLAR_WEIGHT && inHouse.every((r) => p.raw(r.inputs) === null),
    ).map((p) => p.label);

    if (measured / inHouse.length < MIN_HOUSE_COVERAGE || empty.length > 0) {
      skippedHouses.push(house);
      if (empty.length > 0) blockedBy.set(house, empty);
    } else {
      measurableHouses.add(house);
    }
  }

  // ── One cohort per (pillar, peer group) ───────────────────────────────────
  const cohorts = new Map<string, number[]>();
  const cohortKeyOf = (row: AgentRow, peer: string): string =>
    peer === "house-uf" ? `${row.house}:${row.state ?? "??"}` : `${row.house}`;

  for (const pillar of QUALITY_PILLARS) {
    for (const row of rows) {
      const value = pillar.raw(row.inputs);
      if (value === null) continue;
      const key = `${pillar.key}:${cohortKeyOf(row, pillar.peer)}`;
      const list = cohorts.get(key) ?? [];
      list.push(value);
      cohorts.set(key, list);
    }
  }
  // A state with too few members is not a cohort; fall back to its region, which
  // still shares the quota's geography — the reason cost is ranked by UF at all.
  for (const pillar of QUALITY_PILLARS) {
    if (pillar.peer !== "house-uf") continue;
    for (const row of rows) {
      const value = pillar.raw(row.inputs);
      if (value === null) continue;
      const key = `${pillar.key}:region:${row.house}:${REGION_BY_STATE[row.state ?? ""] ?? "??"}`;
      const list = cohorts.get(key) ?? [];
      list.push(value);
      cohorts.set(key, list);
    }
  }

  const scored: Array<{
    id: string;
    kid: string;
    name: string;
    score: number | null;
    pillars: Quality["pillars"];
  }> = [];
  for (const row of rows) {
    const agent = agents.find((a) => a.id === row.id);
    if (!agent) continue;

    const scores = new Map<string, number | null>();
    for (const pillar of QUALITY_PILLARS) {
      const value = pillar.raw(row.inputs);
      if (value === null) {
        scores.set(pillar.key, null);
        continue;
      }
      const primary = cohorts.get(`${pillar.key}:${cohortKeyOf(row, pillar.peer)}`) ?? [];
      let score = relativeScore(value, primary, pillar.higherIsBetter);
      if (score === null && pillar.peer === "house-uf") {
        const region =
          cohorts.get(`${pillar.key}:region:${row.house}:${REGION_BY_STATE[row.state ?? ""] ?? "??"}`) ?? [];
        score = relativeScore(value, region, pillar.higherIsBetter);
      }
      scores.set(pillar.key, score);
    }

    const quality = computeQuality(row.inputs, scores);
    const name = `${agent.firstName} ${agent.lastName}`.trim();
    scored.push({ id: row.id, kid: agent.kid, name, score: quality.score, pillars: quality.pillars });

    if (opts.dryRun || !measurableHouses.has(row.house)) continue;
    await db.publicAgent.update({
      where: { id: row.id },
      data: {
        qualityScore: quality.score,
        // The raw inputs ride along beside the pillars so the page can FORMAT
        // the reading at render time instead of replaying a string frozen at
        // recompute. Without them a wording or rounding fix only reaches a
        // citizen after the next full recompute — which is exactly how
        // "R$ 1.276.327 em 34.74775840337093 meses" survived being fixed.
        qualityPillars: { pillars: quality.pillars, inputs: row.inputs } as unknown as object,
        qualityComputedAt: new Date(),
      },
    });
  }

  return { scored, skippedHouses, blockedBy };
}

/** Bills each agent proposed whose situation says they got somewhere. */
async function advancedBillCounts(agentIds: string[]): Promise<Map<string, number>> {
  const themes = await db.theme.findMany({
    where: { proposerId: { in: agentIds } },
    select: { proposerId: true, situation: true },
  });
  const out = new Map<string, number>();
  for (const t of themes) {
    if (!t.proposerId || !isAdvancedSituation(t.situation)) continue;
    out.set(t.proposerId, (out.get(t.proposerId) ?? 0) + 1);
  }
  return out;
}

/** Whether anything at all was written this run. */
function measurable(skipped: House[]): boolean {
  return skipped.length < 2;
}

/** Registry entry: recompute the index from stored data, no network. */
export async function syncQuality(opts: SyncOptions = {}): Promise<SyncResult> {
  const c = counters();
  const { scored, skippedHouses, blockedBy } = await recomputeQualityIndex({
    onProgress: opts.onProgress,
  });
  c.seen = scored.length;
  c.upserted = measurable(skippedHouses) ? scored.filter((s) => s.score !== null).length : 0;

  // The watermark is what the admin panel shows back, so it has to say *why* a
  // house was held back — "nothing was written" with no reason is the state
  // this whole guard exists to stop being invisible.
  const reasons = [...blockedBy.entries()].map(([h, p]) => `${h} sem ${p.join(" e ")}`);
  const skipped = skippedHouses.length
    ? `não gravado — ${reasons.length ? reasons.join("; ") : skippedHouses.join(",")}` +
      (reasons.length ? ". Rode camara:votes e senado:votes antes." : "")
    : new Date().toISOString().slice(0, 10);

  return { itemsSeen: c.seen, itemsUpserted: c.upserted, watermark: skipped };
}
