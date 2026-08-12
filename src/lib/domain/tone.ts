/**
 * Pigment for an index reading.
 *
 * The alignment and engagement indexes are the only numbers on the site that
 * carry colour, so the three bands live here instead of being re-typed at every
 * call site. Moss for aligned, burnt ochre for the middle, brick for distant —
 * the earth pigments of the design system (docs/design.md), never a traffic light.
 */

/** Bar/mark fill for a 0–100 index reading. */
export function alignmentTone(value: number): string {
  return value >= 66
    ? "var(--color-positive)"
    : value >= 33
      ? "var(--color-ochre)"
      : "var(--color-negative)";
}

/**
 * Same three bands, but for text: pure ochre has too little contrast on warm
 * paper, so the middle band darkens to burnt ochre when it is set as type.
 */
export function alignmentInk(value: number): string {
  return value >= 66
    ? "var(--color-positive)"
    : value >= 33
      ? "var(--color-ochre-ink)"
      : "var(--color-negative)";
}
