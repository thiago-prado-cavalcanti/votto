/**
 * Quality Index (CLAUDE.md §3.3).
 *
 * The second reading of a public agent, orthogonal to the alignment index:
 * alignment asks whether they agree with *you*, quality asks whether they are
 * doing the job. Four weighted pillars, each derived from the houses' own
 * published record:
 *
 *   1. **Assiduidade** — roll calls attended over roll calls they could have
 *      attended, with officially recorded leave subtracted from the denominator.
 *   2. **Proposições** — substantive bills authored per month in office, with
 *      the ones that got somewhere counted twice.
 *   3. **Relatorias** — bills rapporteured per month in office.
 *   4. **Custeio do mandato** — parliamentary quota spent per month, inverted.
 *
 * Two decisions carry the whole design:
 *
 * **Every pillar is a percentile within a peer group, not an absolute score.**
 * This is the `priority.ts` lesson applied again. There, a high base marked 35
 * of 42 tabled bills "urgent" and the badge stopped informing; here, roll-call
 * participation in Brazil clusters near 95% for everyone, so passing the raw
 * ratio through would make the pillar carry no information at all. Ranking also
 * cancels *systematic measurement bias per house*: the Câmara publishes only a
 * bill's last rapporteur, so its rapporteurship counts are a floor rather than a
 * count — but the floor applies equally to every deputy, so comparing deputies
 * only with deputies keeps the ranking valid. And it neutralizes the quota's
 * geographic ceiling, which is why cost is ranked within house *and* state.
 *
 * The cost of ranking is that it manufactures a uniform distribution: half of
 * any parliament sits below 50, and the gap between the 40th and 60th percentile
 * may be two sittings. The mitigation is not in the maths — it is that every
 * pillar also carries a `PillarReading`, the raw figure, which the UI is
 * required to print beside the bar. The percentile drives the index; the plain
 * number is what a citizen actually reads.
 *
 * **A pillar that cannot be measured is `null`, and its weight is redistributed
 * across the rest.** Without that, an agent missing one source would be quietly
 * dragged toward zero by a pillar that says nothing about them. Below
 * `MIN_COVERAGE` the whole score is `null` rather than a number built on half a
 * picture — the §3.2 discipline, where a confidently-stated wrong band was
 * judged worse than no band at all.
 *
 * The pillar set is a registry so it can grow (§3.3). Two conditions on any new
 * factor: **both houses publish it or neither is scored on it** (the §8
 * comparability rule), and it is **`null` when unknown, never zero**.
 *
 * Pure: no database, no cache, no clock. The query wrapper lives in
 * `src/lib/domain/quality.ts`, mirroring `positioning.ts` ↔ `domain/positions.ts`.
 */

/** The plain figure shown beside a pillar's bar, so the rank never stands alone. */
export interface PillarReading {
  /** The headline figure, already formatted, e.g. "92%" or "R$ 24,3 mil/mês". */
  value: string;
  /** What the figure is made of, e.g. "312 de 340 votações". */
  detail?: string;
}

/** Everything measured for one agent over the index window. */
export interface QualityInputs {
  attendance: {
    /** Roll calls held by the house while the agent was in the seat, leave excluded. */
    eligible: number;
    attended: number;
    /** Share of the window covered by official leave, 0..1. */
    leaveShare: number;
  } | null;
  authorship: {
    /** Substantive bills only (PL/PEC/PLP/PDL). */
    authored: number;
    /** Of those, the ones that passed the house, became law or await sanction. */
    advanced: number;
    months: number;
  } | null;
  rapporteurship: { count: number; months: number } | null;
  cost: {
    /** Parliamentary quota spent, net of glosa. */
    spent: number;
    /** Reimbursement documents behind it. Zero means "no data", not "spent nothing". */
    documents: number;
    months: number;
  } | null;
}

/** Which cohort a pillar is ranked inside. */
export type PeerScope = "house" | "house-uf";

/** One weighted factor of the index. Adding a factor is adding an entry here. */
export interface QualityPillar {
  key: string;
  /** PT-BR label (presentation only). */
  label: string;
  weight: number;
  peer: PeerScope;
  /**
   * Which end of the scale is good. Cost is the one where less is better, and
   * saying so here is what lets {@link relativeScore} normalize both directions
   * without a pillar having to hide its meaning behind a negation.
   */
  higherIsBetter: boolean;
  /**
   * The comparable figure, in its own units — sittings attended over sittings
   * held, bills per month, reais per month.
   *
   * `null` when the pillar is not measurable for this agent, which redistributes
   * its weight instead of scoring it zero.
   */
  raw: (i: QualityInputs) => number | null;
  reading: (i: QualityInputs) => PillarReading | null;
}

/**
 * Minimum roll calls before attendance means anything. Below this, one missed
 * sitting swings the ratio by tens of points.
 */
const MIN_ROLL_CALLS = 10;

/**
 * Above this share of the window spent on official leave, attendance is `null`.
 *
 * Leave is subtracted from the denominator on purpose — a deputy licensed to
 * serve as a state secretary is not absent from votes held while they were
 * legitimately away. But subtracting without limit inverts the pillar: an agent
 * away for almost the whole window would score perfectly off the two sittings
 * they attended. In a 20-senator sample, `LICENCA_ATIVIDADE_PARLAMENTAR` alone
 * accounted for 770 of 877 recorded leaves, so the excusable surface is large
 * and this ceiling is doing real work.
 */
const MAX_LEAVE_SHARE = 0.4;

/** Months in office before per-month output rates are meaningful. */
const MIN_MONTHS = 6;

/**
 * Minimum share of the index's total weight that must be measurable before a
 * score is published at all. Half a picture stated as a number is worse than no
 * number — the `PositionBadge` precedent (§3.2).
 */
export const MIN_COVERAGE = 0.5;

/** Smallest cohort that can produce a percentile. Three peers are not a distribution. */
const MIN_COHORT = 5;

/**
 * Largest share of a cohort that may sit in one tie block and still be scored.
 *
 * A pillar where most of the cohort holds the identical value is not measuring
 * those members — it hands them all the same midrank and, through the weighted
 * mean, adds a near-constant that pulls every score toward the middle and
 * dilutes the pillars that do discriminate.
 *
 * This is not hypothetical. On the first real load, 87% of scored agents sat in
 * one block at 50 for relatorias (against 1–3% for the other three pillars),
 * because the Câmara publishes only a bill's last rapporteur and most deputies
 * therefore have none on record. It cost the top of the ranking ~8 points and
 * lifted the bottom by the same, for a pillar that said nothing about either.
 *
 * So the majority block returns `null` and its weight is redistributed — the
 * same rule this index applies everywhere else: no measurement is better than a
 * number that only looks like one. The minority who *are* distinguished keep
 * their score, because "reported bills, which most never do" is a real signal.
 */
const MAX_TIE_SHARE = 0.5;

function brl(value: number): string {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  });
}

/**
 * The four pillars and their weights.
 *
 * Attendance leads because it is the floor of the office — the one duty every
 * mandate shares, whatever the holder believes. Authorship and cost sit level
 * beneath it: initiative, and what the mandate consumes to exercise it.
 *
 * Rapporteurship is deliberately last. A relatoria is *assigned by the
 * leadership*, so it measures standing inside the house at least as much as
 * merit, and on the Câmara side it is a floor rather than a count. Weighting it
 * like the others would score a party's floor power and call it quality.
 */
export const QUALITY_PILLARS: QualityPillar[] = [
  {
    key: "attendance",
    higherIsBetter: true,
    label: "Assiduidade",
    weight: 1 / 3,
    peer: "house",
    raw: (i) => {
      const a = i.attendance;
      if (!a || a.eligible < MIN_ROLL_CALLS) return null;
      if (a.leaveShare > MAX_LEAVE_SHARE) return null;
      return a.attended / a.eligible;
    },
    reading: (i) => {
      const a = i.attendance;
      if (!a || a.eligible === 0) return null;
      return {
        value: `${Math.round((a.attended / a.eligible) * 100)}%`,
        detail: `${a.attended} de ${a.eligible} votações`,
      };
    },
  },
  {
    key: "production",
    label: "Relatorias e proposições",
    weight: 1 / 3,
    peer: "house",
    higherIsBetter: true,
    // One pillar, not two, because they are one thing: what the parliamentarian
    // put through the house. Splitting them also punished the Câmara twice over
    // — it publishes only a bill's last rapporteur, so relatoria alone could be
    // measured for 75 members out of 594 and was null for everybody else.
    //
    // Outcome counts twice: filing is the cheap half, so the half that is hard
    // to fake is the half that separates somebody who files from somebody who
    // carries something through.
    raw: (i) => {
      const a = i.authorship;
      const r = i.rapporteurship;
      const months = a?.months ?? r?.months ?? 0;
      if (months < MIN_MONTHS) return null;
      const authored = a ? a.authored + a.advanced : 0;
      return (authored + (r?.count ?? 0)) / months;
    },
    reading: (i) => {
      const a = i.authorship;
      const r = i.rapporteurship;
      if (!a && !r) return null;
      const authored = a?.authored ?? 0;
      const reported = r?.count ?? 0;
      const parts = [`${authored} apresentad${authored === 1 ? "o" : "os"}`];
      parts.push(`${reported} relatad${reported === 1 ? "o" : "os"}`);
      if (a && a.advanced > 0) parts.push(`${a.advanced} avançaram`);
      return { value: `${authored + reported}`, detail: parts.join(" · ") };
    },
  },
  {
    key: "cost",
    label: "Custo político",
    weight: 1 / 3,
    peer: "house-uf",
    higherIsBetter: false,
    // `documents === 0` is null, never a top score. It is the worst false
    // positive the index could produce: a month the house has not published
    // yet, or an agent away on leave, is indistinguishable from R$ 0 spent —
    // and reading that as exemplary frugality would be exactly backwards.
    raw: (i) => {
      const c = i.cost;
      if (!c || c.documents === 0 || c.months < MIN_MONTHS) return null;
      return c.spent / c.months;
    },
    reading: (i) => {
      const c = i.cost;
      if (!c || c.documents === 0) return null;
      return {
        value: `${brl(c.spent / Math.max(1, c.months))}/mês`,
        detail: `média de ${Math.round(c.months)} meses · ${brl(c.spent)} no total`,
      };
    },
  },
];

/** One pillar as it reaches the DTO and the page. */
export interface QualityPillarResult {
  key: string;
  label: string;
  /** 0–100 percentile within the peer group, or null when not measurable. */
  score: number | null;
  weight: number;
  reading: PillarReading | null;
}

export interface Quality {
  /** 0–100, or null below `MIN_COVERAGE`. */
  score: number | null;
  pillars: QualityPillarResult[];
  /** Share of total weight that produced a score, 0..1. */
  coverage: number;
}

/**
 * Score a value against the best in its peer group, as 0–100.
 *
 * A proportion, not a rank: if the most assiduous member of a house attended 200
 * sittings, 200 is 100 and 100 is 50. That is a different statement from a
 * percentile, which would say "ahead of 80% of your peers" and tell you nothing
 * about the size of the gap — two agents one sitting apart can sit twenty
 * percentile points apart in a tight field, and a hundred apart in a loose one.
 *
 * A pillar where less is better inverts the ratio instead of the value: the
 * cheapest mandate is 100, and one costing twice as much is 50. Same sentence,
 * read from the other end.
 *
 * The cost of a proportion is that one outlier compresses everybody — a member
 * who files four hundred bills where the median is ten leaves the rest scoring
 * in the single digits. That is a real property of the measure and not a bug,
 * but it is why `requality` prints the distribution: a pillar whose whole
 * cohort has been flattened into the bottom fifth has stopped discriminating
 * just as surely as one where they all tie.
 *
 * `null` below `MIN_COHORT`, and `null` when the value shares a tie block
 * covering more than `MAX_TIE_SHARE` of the cohort — a score shared with most of
 * the field ranks nobody.
 */
export function relativeScore(
  value: number,
  cohort: number[],
  higherIsBetter = true,
): number | null {
  if (cohort.length < MIN_COHORT) return null;

  const tied = cohort.filter((other) => other === value).length;
  if (tied / cohort.length > MAX_TIE_SHARE) return null;

  if (higherIsBetter) {
    const best = Math.max(...cohort);
    // Everybody at zero: there is nothing here to tell them apart.
    if (best <= 0) return null;
    return Math.round(Math.max(0, Math.min(100, (value / best) * 100)));
  }

  // Less is better: the smallest spend is the benchmark. A zero would make every
  // other agent score nothing, so it is treated as unmeasurable rather than as
  // the perfect mandate — the same reason `cost` refuses an agent with no
  // documents at all.
  const cheapest = Math.min(...cohort.filter((other) => other > 0));
  if (!Number.isFinite(cheapest) || value <= 0) return null;
  return Math.round(Math.max(0, Math.min(100, (cheapest / value) * 100)));
}

/**
 * Combine the pillars into the published 0–100.
 *
 * `scores` maps pillar key → the agent's already-computed 0–100 against its peer
 * group; it comes from the recompute step, which is the only place that holds
 * the whole cohort. A key that is absent or null means the pillar did not
 * produce a score, and its weight is redistributed over the pillars that did.
 */
export function computeQuality(
  inputs: QualityInputs,
  scores: Map<string, number | null>,
): Quality {
  const pillars: QualityPillarResult[] = QUALITY_PILLARS.map((pillar) => ({
    key: pillar.key,
    label: pillar.label,
    score: pillar.raw(inputs) === null ? null : (scores.get(pillar.key) ?? null),
    weight: pillar.weight,
    reading: pillar.reading(inputs),
  }));

  const totalWeight = QUALITY_PILLARS.reduce((sum, p) => sum + p.weight, 0);
  const scored = pillars.filter((p) => p.score !== null);
  const measuredWeight = scored.reduce((sum, p) => sum + p.weight, 0);
  const coverage = totalWeight > 0 ? measuredWeight / totalWeight : 0;

  if (coverage < MIN_COVERAGE || measuredWeight === 0) {
    return { score: null, pillars, coverage };
  }

  // Weighted mean over the measured pillars only. Dividing by `measuredWeight`
  // rather than `totalWeight` is the redistribution: an agent measured on three
  // pillars is scored on those three, not punished for the fourth.
  const weighted = scored.reduce((sum, p) => sum + (p.score as number) * p.weight, 0);
  const score = Math.round(Math.max(0, Math.min(100, weighted / measuredWeight)));

  return { score, pillars, coverage };
}

/**
 * Whether a bill's situation means it got somewhere.
 *
 * "Advanced" is the half of authorship that is hard to fake. Filing a bill costs
 * a signature; carrying one through a house does not, so the outcome is counted
 * a second time on top of the filing (see the `authorship` pillar).
 *
 * Both houses phrase this differently but share word stems, so one matcher
 * serves both — the same approach as `isConcludedSituation` in
 * `src/lib/domain/priority.ts`, and deliberately disjoint from it: that one
 * answers "has this stopped moving", which is true of a shelved bill too.
 */
export function isAdvancedSituation(situation: string | null | undefined): boolean {
  const s = (situation ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  if (!s) return false;
  // Became law, or is at the President's desk waiting to.
  if (s.includes("transformad") || s.includes("norma juridica")) return true;
  if (s.includes("aguardando sancao") || s.includes("remetida a sancao")) return true;
  // Cleared this house and moved to the other one.
  if (s.includes("apreciacao pelo senado") || s.includes("apreciacao pela camara")) return true;
  if (s.includes("aprovad")) return true;
  return false;
}

/** Coarse quality band, for badges and filters. */
export type QualityBand = "EXCELLENT" | "GOOD" | "AVERAGE" | "WEAK";

/**
 * Map a 0–100 quality score onto its band.
 *
 * The cut points sit lower than `priority`'s (80/60/30) because a mean of
 * percentiles is centred near 50 by construction: reusing those cuts would file
 * half of any parliament under the bottom band and say nothing.
 *
 * **These cuts are provisional and still concentrate.** Over a simulated bench
 * of 563 (deliberately shaped like a real one — attendance clustered near 92%,
 * half the members with no relatoria) the composite spread 7…100 with a median
 * of 50, which is a healthy *ranking*; but 51% of it landed between 40 and 60,
 * so the middle band swallowed the parliament and only 1.6% reached the top one.
 * That is arithmetic, not a bug: averaging four independent uniforms pulls mass
 * to the centre, and it will do the same on real data.
 *
 * Two ways out, to be chosen against a real histogram (`npm run requality --dry`)
 * rather than against a simulation:
 *
 *   1. Move these cuts out to the observed quantiles (roughly 62/52/42).
 *   2. Rank the composite itself, making the bands exact quintiles. Costs the
 *      one property worth keeping today — that the headline number is the
 *      weighted mean of the four figures printed under it, so a reader can check
 *      the arithmetic on the page.
 *
 * Until then the labels are comparative rather than evaluative, which keeps a
 * concentrated distribution honest: "na média" is a true thing to say about the
 * middle of one.
 */
export function qualityBand(score: number): QualityBand {
  if (score >= 80) return "EXCELLENT";
  if (score >= 60) return "GOOD";
  if (score >= 40) return "AVERAGE";
  return "WEAK";
}

/** The same bands as numeric ranges (`min` inclusive, `max` exclusive), for SQL counts. */
export const QUALITY_BAND_RANGES: Array<{ band: QualityBand; min: number; max?: number }> = [
  { band: "EXCELLENT", min: 80 },
  { band: "GOOD", min: 60, max: 80 },
  { band: "AVERAGE", min: 40, max: 60 },
  { band: "WEAK", min: 0, max: 40 },
];

/**
 * PT-BR band labels (presentation only).
 *
 * Comparative, never evaluative. The score is a rank against peers, so "Acima da
 * média" is what it actually says; "Excelente" would be a verdict the maths has
 * not earned, and a verdict about a named person is the one thing this index
 * must not state loosely.
 */
export const qualityBandLabel: Record<QualityBand, string> = {
  EXCELLENT: "Muito acima da média",
  GOOD: "Acima da média",
  AVERAGE: "Na média",
  WEAK: "Abaixo da média",
};
