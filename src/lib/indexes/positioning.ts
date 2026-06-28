/**
 * Political Positioning Index (CLAUDE.md §3.2).
 *
 * Each person (citizen or agent) is placed on the classic left↔right political
 * spectrum using a 5-point scale:
 *
 *   Esquerda · Centro-esquerda · Centro · Centro-direita · Direita
 *
 * The placement is derived from how they voted on themes tagged with dimension
 * weights on two underlying axes:
 *   - Economic axis:  "Estado" (−) ↔ "Mercado" (+)
 *   - Social axis:    "Comunidade" (−) ↔ "Indivíduo" (+)
 *
 * A YES vote pushes the person toward the theme's tagged direction; NO pushes the
 * opposite; ABSTENTION is ignored. The two axes are normalized to −100..+100 and
 * combined into a single left↔right `spectrum` score (economic-weighted), which
 * maps to one of the five bands. The two axes are retained for the supporting
 * positioning chart.
 */
export interface ThemeDimensions {
  /** −1..1 — how a YES vote leans on the economic axis (Estado − / Mercado +). */
  economic?: number;
  /** −1..1 — how a YES vote leans on the social axis (Comunidade − / Indivíduo +). */
  social?: number;
}

export interface Position {
  /** −100..100 (Estado ↔ Mercado) */
  economic: number;
  /** −100..100 (Comunidade ↔ Indivíduo) */
  social: number;
  /** −100..100 single left↔right score (negative = esquerda, positive = direita). */
  spectrum: number;
  /** number of votes that contributed to the position */
  basis: number;
  /** band key, e.g. "centro-direita" */
  profileKey: string;
  /** band label, e.g. "Centro-direita" */
  profileLabel: string;
}

import type { VoteValue } from "@/generated/prisma";

function parseDimensions(value: unknown): ThemeDimensions {
  if (!value || typeof value !== "object") return {};
  const v = value as Record<string, unknown>;
  const num = (x: unknown) => (typeof x === "number" ? Math.max(-1, Math.min(1, x)) : 0);
  return { economic: num(v.economic), social: num(v.social) };
}

function voteScore(v: VoteValue): number {
  return v === "YES" ? 1 : v === "NO" ? -1 : 0;
}

/** The five spectrum bands, ordered left → right (for legends/filters). */
export const SPECTRUM_BANDS = [
  { key: "esquerda", label: "Esquerda" },
  { key: "centro-esquerda", label: "Centro-esquerda" },
  { key: "centro", label: "Centro" },
  { key: "centro-direita", label: "Centro-direita" },
  { key: "direita", label: "Direita" },
] as const;

/** Map a −100..100 spectrum score to one of the five left↔right bands. */
export function deriveBand(spectrum: number): { key: string; label: string } {
  if (spectrum >= 50) return { key: "direita", label: "Direita" };
  if (spectrum >= 15) return { key: "centro-direita", label: "Centro-direita" };
  if (spectrum > -15) return { key: "centro", label: "Centro" };
  if (spectrum > -50) return { key: "centro-esquerda", label: "Centro-esquerda" };
  return { key: "esquerda", label: "Esquerda" };
}

/**
 * Compute a position from a person's votes. Each vote carries the theme's
 * dimension weights. Pure function — usable for both citizens and agents.
 */
export function computePosition(
  votes: Array<{ value: VoteValue; dimensions: unknown }>,
): Position {
  let ecoSum = 0;
  let ecoW = 0;
  let socSum = 0;
  let socW = 0;
  let basis = 0;

  for (const vote of votes) {
    const s = voteScore(vote.value);
    if (s === 0) continue; // abstentions don't move the position
    const dim = parseDimensions(vote.dimensions);
    if (dim.economic) {
      ecoSum += s * dim.economic;
      ecoW += Math.abs(dim.economic);
    }
    if (dim.social) {
      socSum += s * dim.social;
      socW += Math.abs(dim.social);
    }
    if (dim.economic || dim.social) basis += 1;
  }

  const economic = ecoW > 0 ? Math.round((ecoSum / ecoW) * 100) : 0;
  const social = socW > 0 ? Math.round((socSum / socW) * 100) : 0;
  // Single left↔right score: economic axis dominates, social contributes less.
  const spectrum = Math.max(-100, Math.min(100, Math.round(economic * 0.7 + social * 0.3)));
  const band = deriveBand(spectrum);

  return {
    economic,
    social,
    spectrum,
    basis,
    profileKey: band.key,
    profileLabel: band.label,
  };
}

export const POSITIONING_AXES = {
  economic: { negative: "Estado", positive: "Mercado" },
  social: { negative: "Comunidade", positive: "Indivíduo" },
} as const;
