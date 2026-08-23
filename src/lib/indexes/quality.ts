/**
 * Performance política — a composite indicator over three pillars (CLAUDE.md §3.3).
 *
 * Built to the OECD/JRC *Handbook on Constructing Composite Indicators* and the
 * JRC 10-Step Pocket Guide, because this number is published against a named
 * person and has to survive being argued with.
 *
 * ── Why fixed goalposts, and not a comparison with peers ────────────────────
 *
 * Every earlier version normalised inside a peer group — first by percentile,
 * then as a proportion of the group's best. Measured on the real bench, both
 * were unusable:
 *
 *   - **Proportion-to-the-best silently rewrote the weights.** The pillars
 *     nominally weigh a third each; their measured influence on the composite
 *     was 19% / 60% / 21%. The published claim was false.
 *   - **It handed one person control of everyone's score.** Doubling the top
 *     producer's output halved 593 other readings. The cheapest mandate in the
 *     Câmara — R$1,094/month, certainly a partial record rather than a virtuoso
 *     of thrift — was the benchmark every other deputy was measured against, and
 *     the median deputy scored **2 out of 100** on cost.
 *   - **Small groups published noise.** In a five-member cohort a score carried
 *     ±27 points of pure sampling variation: half the reading was who else
 *     happened to be in the room.
 *   - **Scores moved between editions for members who had not changed.**
 *
 * So the index does what the HDI, the EPI and the SDG Index do: it scores
 * against **fixed goalposts, frozen and published**. A member's reading changes
 * when their own conduct changes, and at no other time. The Handbook's warning
 * about the alternative is explicit (p. 28): normalising by the group leader
 * *"is based on extreme values which could be unreliable outliers."*
 *
 * ── Why production is read on a log scale ───────────────────────────────────
 *
 * The JRC screening rule flags an indicator when |skewness| > 2 and kurtosis
 * > 3.5. The Câmara's production rate measures **7.20 and 70.81** — an order of
 * magnitude past it. Winsorising, the rule's first remedy, cannot rescue it:
 * capping the five most extreme members still leaves skew at 3.6, and the cap
 * has to reach the median before the scale opens up. The rule's own fallback for
 * that case is the natural logarithm.
 *
 * `log1p(x/α)` rather than `log(x + 1)`: it is exactly 0 at x = 0, so a member
 * who filed nothing scores zero with no special case, and α is a published rate
 * with units rather than an arbitrary constant. Note what the choice means —
 * Handbook p. 84: a log *"leads to the attribution of a higher weight for a
 * one-unit increase, starting from a low level of performance."* The 400th bill
 * counts for less than the first. Deliberate, and stated on the page.
 *
 * ── Why cost is a utilisation rate ──────────────────────────────────────────
 *
 * The quota ceiling is published per state and per house and varies by a factor
 * of 2.4 (`domain/quota-ceilings.ts`). Dividing by it gives the share of an
 * entitlement actually drawn — bounded, comparable across states and houses, and
 * needing no cohort. Its skewness is then mild enough that the screening rule
 * does not fire, and logging it would make it worse.
 *
 * ── Why the geometric mean ──────────────────────────────────────────────────
 *
 * An arithmetic mean is fully compensatory: it scored a member who never
 * attends, one who never legislates and one who spends the whole quota at an
 * identical, respectable 63. Handbook §6.10 shows additive aggregation requires
 * preference independence, which these pillars fail — the value of one more bill
 * is not independent of whether the member turns up. The HDI changed for exactly
 * this reason in 2010: *"Poor performance in any dimension is now directly
 * reflected… there is no longer perfect substitutability."*
 *
 * Pure: no database, no cache, no clock. The query wrapper lives in
 * `src/lib/domain/quality.ts`.
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
    /**
     * The member's published monthly ceiling (`domain/quota-ceilings.ts`).
     *
     * Null when we cannot place them — a utilisation rate computed against the
     * wrong ceiling is worse than no reading, so the pillar declines rather than
     * guessing.
     */
    ceiling: number | null;
  } | null;
}

/** Which cohort a pillar is ranked inside. */
/** Which chamber a member sits in. The goalposts differ; the method does not. */
export type QualityHouse = "CAMARA" | "SENADO";

/** One weighted factor of the index. Adding a factor is adding an entry here. */
export interface QualityPillar {
  key: string;
  /** PT-BR label (presentation only). */
  label: string;
  weight: number;
  /**
   * The member's own 0–100 against the published goalposts, or null when the
   * pillar cannot be measured for them — which redistributes its weight rather
   * than scoring them zero.
   *
   * Takes only the member's own figures and the constants below. Nothing about
   * anybody else enters, which is the property the whole redesign is for.
   */
  score: (i: QualityInputs, house: QualityHouse) => number | null;
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
 * legitimately away. But subtracting without limit inverts the pillar: someone
 * away for almost the whole window would score perfectly off two sittings.
 */
const MAX_LEAVE_SHARE = 0.4;

/** Months in office before a per-month rate is meaningful. */
const MIN_MONTHS = 6;

/**
 * Minimum share of the index's total weight that must be measurable before a
 * score is published. Half a picture stated as a number is worse than no number
 * — the `PositionBadge` precedent (§3.2).
 */
export const MIN_COVERAGE = 0.5;

/**
 * Floor applied to every pillar before the geometric mean.
 *
 * A geometric mean is zero if any factor is zero, which would collapse every
 * distinct way of failing into the same "0". One point keeps a total failure on
 * one pillar visibly bad and still separable from a failure on two.
 */
const PILLAR_FLOOR = 1;

/**
 * The published goalposts. **Frozen constants, not observed extremes.**
 *
 * This is the whole point of the redesign: a member's score is a statement about
 * them, checkable against a number printed on the page, and it does not move
 * when somebody else's conduct does. Round, human-readable values in the manner
 * of the HDI's "20 and 85 years" — derived from the real distribution, then
 * rounded and fixed.
 *
 * Production differs by house because the difference is structural, not merit:
 * 81 senators share roughly the volume of rapporteurships that 513 deputies do,
 * so the median senator's rate is about four times the median deputy's. One
 * shared goalpost would rank the house, not the person. This is a documented
 * adjustment, which is exactly what the alternative — re-baselining invisibly
 * inside each house — was not.
 */
export const GOALPOSTS = {
  /**
   * Share of eligible sittings attended. 1.00 is perfect attendance — a real
   * target, not a percentile. The floor sits near the 5th percentile of the
   * bench (0.536), so the members it pins are genuinely absent rather than
   * merely below average.
   */
  attendance: { floor: 0.5, target: 1.0 },
  /**
   * Substantive items (authored + advanced + rapporteured) per month in office.
   * `alpha` is the house median — it sets where the log's curvature bites —
   * and `target` its 95th percentile, rounded.
   *
   * The two houses differ because the difference is structural, not merit: 81
   * senators share roughly the volume of rapporteurships that 513 deputies do,
   * so the median senator's rate is four times the median deputy's. One shared
   * benchmark would rank the house, not the person.
   */
  production: {
    CAMARA: { alpha: 1.45, target: 4.6 },
    SENADO: { alpha: 6.0, target: 16 },
  },
  /**
   * Share of the published quota ceiling drawn, reverse-coded.
   *
   * The floor is above 1.00 because the quota accumulates across the financial
   * year (Ato da Mesa 43/2009 art. 13), so a member can legitimately draw more
   * than one month's ceiling in a month. 0.50 is the target because the 5th
   * percentile of the bench sits at 0.63 — half the entitlement is a real,
   * reachable standard rather than an invented one.
   */
  cost: { target: 0.5, floor: 1.1 },
} as const;

/** Linear goalpost scoring, clamped. The Handbook's `distance to a reference`. */
function goalpost(value: number, worst: number, best: number): number {
  const range = best - worst;
  if (range === 0) return PILLAR_FLOOR;
  const scaled = ((value - worst) / range) * 100;
  return Math.max(PILLAR_FLOOR, Math.min(100, Math.round(scaled)));
}

function brl(value: number): string {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  });
}

/**
 * The three pillars, each worth a third.
 *
 * Relatorias and proposições are one pillar, not two: they are the same thing —
 * what the member put through the house — and separating them punished the
 * Câmara twice, since it publishes only a bill's last rapporteur and relatoria
 * alone could be measured for 75 of 594 members.
 */
export const QUALITY_PILLARS: QualityPillar[] = [
  {
    key: "attendance",
    label: "Assiduidade",
    weight: 1 / 3,
    score: (i) => {
      const a = i.attendance;
      if (!a || a.eligible < MIN_ROLL_CALLS) return null;
      if (a.leaveShare > MAX_LEAVE_SHARE) return null;
      const { floor, target } = GOALPOSTS.attendance;
      return goalpost(a.attended / a.eligible, floor, target);
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
    // Outcome counts twice: filing is the cheap half, so the half that is hard
    // to fake is the half that separates somebody who files from somebody who
    // carries something through.
    score: (i, house) => {
      const rate = productionRate(i);
      if (rate === null) return null;
      const { alpha, target } = GOALPOSTS.production[house];
      // log1p(x/α) is exactly 0 at x = 0 — a member who filed nothing scores the
      // floor with no special case, and α is a rate with units rather than an
      // arbitrary +1.
      const scaled = Math.log1p(rate / alpha) / Math.log1p(target / alpha);
      return Math.max(PILLAR_FLOOR, Math.min(100, Math.round(scaled * 100)));
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
    // Reverse-coded against the ceiling: drawing all of the entitlement scores
    // the floor, drawing 40% or less scores 100.
    //
    // `documents === 0` is null, never a top score. It is the worst false
    // positive the index could produce: a month the house has not published yet,
    // or a member away on leave, is indistinguishable from R$ 0 spent, and
    // reading that as exemplary frugality would be exactly backwards.
    score: (i) => {
      const c = i.cost;
      if (!c || c.documents === 0 || c.months < MIN_MONTHS || !c.ceiling) return null;
      const utilisation = c.spent / c.months / c.ceiling;
      return goalpost(utilisation, GOALPOSTS.cost.floor, GOALPOSTS.cost.target);
    },
    reading: (i) => {
      const c = i.cost;
      if (!c || c.documents === 0) return null;
      const perMonth = c.spent / Math.max(1, c.months);
      const share = c.ceiling ? Math.round((perMonth / c.ceiling) * 100) : null;
      return {
        value: `${brl(perMonth)}/mês`,
        detail:
          share === null
            ? `média de ${Math.round(c.months)} meses`
            : `${share}% da cota a que tem direito · média de ${Math.round(c.months)} meses`,
      };
    },
  },
];

/** Substantive items per month in office, or null when the basis is too thin. */
function productionRate(i: QualityInputs): number | null {
  const a = i.authorship;
  const r = i.rapporteurship;
  const months = a?.months ?? r?.months ?? 0;
  if (months < MIN_MONTHS) return null;
  const authored = a ? a.authored + a.advanced : 0;
  return (authored + (r?.count ?? 0)) / months;
}

/** One pillar as it reaches the DTO and the page. */
export interface QualityPillarResult {
  key: string;
  label: string;
  /** 0–100 against the published goalposts, or null when not measurable. */
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
 * Combine the pillars into the published 0–100, by weighted GEOMETRIC mean.
 *
 * `exp(Σ wᵢ·ln xᵢ / Σ wᵢ)` over the pillars that produced a score. Weight is
 * redistributed across the rest, which is arithmetically the same as imputing
 * the missing pillar at the geometric mean of the observed ones — worth knowing,
 * because it means a member whose missing pillar would have been bad is
 * flattered by the gap. Below `MIN_COVERAGE` nothing is published at all.
 *
 * Needs no cohort and no second pass: everything it reads is the member's own.
 */
export function computeQuality(inputs: QualityInputs, house: QualityHouse): Quality {
  const pillars: QualityPillarResult[] = QUALITY_PILLARS.map((pillar) => ({
    key: pillar.key,
    label: pillar.label,
    score: pillar.score(inputs, house),
    weight: pillar.weight,
    reading: pillar.reading(inputs),
  }));

  const totalWeight = QUALITY_PILLARS.reduce((sum, p) => sum + p.weight, 0);
  const scored = pillars.filter(
    (p): p is QualityPillarResult & { score: number } => p.score !== null,
  );
  const measuredWeight = scored.reduce((sum, p) => sum + p.weight, 0);
  const coverage = totalWeight > 0 ? measuredWeight / totalWeight : 0;

  if (coverage < MIN_COVERAGE || measuredWeight === 0) {
    return { score: null, pillars, coverage };
  }

  const logged = scored.reduce((sum, p) => sum + p.weight * Math.log(p.score), 0);
  const score = Math.round(Math.exp(logged / measuredWeight));

  return { score: Math.max(0, Math.min(100, score)), pillars, coverage };
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

/**
 * Shape of an indicator's raw values across the bench, for the diagnostic
 * `requality` prints.
 *
 * Nothing scores against this any more — the goalposts are fixed. It is kept
 * because the screening rule that chose the treatment has to keep being checked:
 * if the Câmara's production skewness ever falls back inside |2| / 3.5, the log
 * is no longer mandated and should be revisited; if another indicator drifts out
 * of it, one is.
 *
 * Skewness and kurtosis are here because they are the recognized trigger for
 * treating an indicator before normalizing it: the convention used by composite
 * indices (the Global Innovation Index states it explicitly) is that
 * |skewness| > 2 together with kurtosis > 3.5 marks a distribution one outlier
 * is driving. Measured on the first real load, the Câmara's production indicator
 * came in at 7.20 and 70.81 — and the median deputy scored 5 out of 100 on it.
 */
export interface CohortShape {
  n: number;
  median: number;
  max: number;
  skewness: number;
  kurtosis: number;
  /** True when the distribution is skewed enough that normalizing it raw misleads. */
  needsTreatment: boolean;
}

export function describeCohort(values: number[]): CohortShape | null {
  const n = values.length;
  if (n < 5) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mean = values.reduce((sum, v) => sum + v, 0) / n;
  const sd = Math.sqrt(values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / n);
  const moment = (power: number) =>
    sd === 0 ? 0 : values.reduce((sum, v) => sum + ((v - mean) / sd) ** power, 0) / n;
  const skewness = moment(3);
  const kurtosis = moment(4) - 3;
  return {
    n,
    median: sorted[Math.floor(n / 2)],
    max: sorted[n - 1],
    skewness,
    kurtosis,
    needsTreatment: Math.abs(skewness) > 2 && kurtosis > 3.5,
  };
}

/** Coarse quality band, for badges and filters. *//** Coarse quality band, for badges and filters. */
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
