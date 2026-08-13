/**
 * The left↔right positioning band ("Centro direita"), set as plain text.
 *
 * Not a tag and not a button: a badge is a printed label for something the
 * record *states* — a party, a procedural regime — while the band is a reading
 * this site computed from votes. Boxing it made it look like a control, and next
 * to the party mark two bordered pills read as a toolbar.
 *
 * Set below the name it qualifies and in one ink for every band: it is a caption
 * on the record, so it should not out-rank the agent's name nor colour-code five
 * political positions in a product whose whole claim is that it does not take
 * sides.
 *
 * Server-component friendly (no client hooks).
 *
 * NOT CURRENTLY MOUNTED. The left↔right band it draws is computed from theme
 * axis tags that are not filled in yet (CLAUDE.md §11), so it was placing PL at
 * the centre — a wrong verdict stated with confidence. Kept, unrendered, until
 * the tagging exists; the two-axis figure (`PositioningChart`) stays live
 * because it shows a shape rather than a sentence.
 */
export function PositionBadge({
  profileLabel,
  basis,
}: {
  profileLabel: string;
  /** Kept for call-site compatibility; the band is one ink regardless. */
  profileKey?: string;
  basis?: number;
}) {
  const unavailable = basis !== undefined && basis === 0;

  return (
    <span className="text-[0.625rem] font-semibold uppercase tracking-[0.06em] text-[var(--color-muted)]">
      {unavailable ? "Posição indisponível" : profileLabel}
    </span>
  );
}
