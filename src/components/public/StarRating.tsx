/**
 * Five-star rating derived from a 0–100 index (App Store / Play metaphor).
 * Server-safe (pure SVG). Used on agent/party cards and embeds alongside the %.
 */
const STAR_PATH =
  "M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z";

export function StarRating({
  value,
  size = 16,
  className,
}: {
  /** 0–100 alignment percentage. */
  value: number;
  size?: number;
  className?: string;
}) {
  const filled = Math.round(Math.max(0, Math.min(100, value)) / 20);
  return (
    <div className={className} style={{ display: "inline-flex", gap: 2 }} aria-hidden>
      {[0, 1, 2, 3, 4].map((i) => (
        <svg key={i} width={size} height={size} viewBox="0 0 24 24">
          {/* Ochre is the system's highlight pigment; terracota is reserved for
              action, so the stars are gilded, not clickable-looking. */}
          <path d={STAR_PATH} fill={i < filled ? "var(--color-ochre)" : "var(--color-navy-200)"} />
        </svg>
      ))}
    </div>
  );
}
