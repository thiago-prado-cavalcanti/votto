/**
 * Political Positioning Index (CLAUDE.md §3.2) — provisional model (§11).
 *
 * We deliberately avoid the dated, polarizing left↔right vocabulary. Instead each
 * person (citizen or agent) is placed on two neutral, descriptive axes derived
 * from how they voted on themes tagged with dimension weights:
 *
 *   - Economic axis:  "Estado"  (−)  ↔  "Mercado"  (+)
 *       (preference for collective/state coordination vs market mechanisms)
 *   - Social axis:    "Comunidade" (−) ↔ "Indivíduo" (+)
 *       (shared community norms vs individual autonomy)
 *
 * A YES vote pushes the person toward the theme's tagged direction; NO pushes the
 * opposite; ABSTENTION is ignored. Coordinates are normalized to −100..+100.
 *
 * The derived `profile` is a neutral label (Votto's own vocabulary), NOT a
 * left/right placement. Names are provisional and meant to be validated.
 */
import type { VoteValue } from "@/generated/prisma";

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
  /** number of votes that contributed to the position */
  basis: number;
  profileKey: string;
  profileLabel: string;
}

function parseDimensions(value: unknown): ThemeDimensions {
  if (!value || typeof value !== "object") return {};
  const v = value as Record<string, unknown>;
  const num = (x: unknown) => (typeof x === "number" ? Math.max(-1, Math.min(1, x)) : 0);
  return { economic: num(v.economic), social: num(v.social) };
}

function voteScore(v: VoteValue): number {
  return v === "YES" ? 1 : v === "NO" ? -1 : 0;
}

/**
 * Map raw axis coordinates to a neutral, descriptive profile. The center band is
 * "Equilibrado"; otherwise we combine the dominant pole of each axis.
 */
export function deriveProfile(economic: number, social: number): { key: string; label: string } {
  const dead = 18; // central dead-zone → balanced
  if (Math.abs(economic) <= dead && Math.abs(social) <= dead) {
    return { key: "balanced", label: "Equilibrado" };
  }
  const eco = economic >= 0 ? "mercado" : "estado";
  const soc = social >= 0 ? "individuo" : "comunidade";
  const map: Record<string, string> = {
    "estado:comunidade": "Comunitário",
    "estado:individuo": "Reformador",
    "mercado:comunidade": "Pragmático",
    "mercado:individuo": "Autonomista",
  };
  const key = `${eco}:${soc}`;
  return { key, label: map[key] ?? "Equilibrado" };
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
  const profile = deriveProfile(economic, social);

  return { economic, social, basis, profileKey: profile.key, profileLabel: profile.label };
}

export const POSITIONING_AXES = {
  economic: { negative: "Estado", positive: "Mercado" },
  social: { negative: "Comunidade", positive: "Indivíduo" },
} as const;
