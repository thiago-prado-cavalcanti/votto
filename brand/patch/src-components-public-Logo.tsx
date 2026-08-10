/**
 * Votto standalone mark.
 *
 * Concept: a symmetrical geometric "V" that doubles as a ballot check. Both arms
 * share the same length and mirrored inclination; the colour divides exactly at
 * the vertex — institutional anchor on the left arm, brand orange on the right.
 * Drawn as two rounded strokes meeting at the vertex so the join stays clean at
 * any size.
 */
import { cn } from "@/lib/cn";

type LogoTone = "light" | "dark";

const TONES: Record<LogoTone, { anchor: string; tile: string }> = {
  // On a light header: deep teal anchor on a faint tinted tile.
  light: { anchor: "var(--color-colonial-600)", tile: "var(--color-colonial-50)" },
  // On a dark footer: light anchor on a translucent tile.
  dark: { anchor: "#ffffff", tile: "rgba(255,255,255,0.10)" },
};

export function Logo({
  tone = "light",
  className,
}: {
  tone?: LogoTone;
  className?: string;
}) {
  const { anchor, tile } = TONES[tone];

  return (
    <svg
      viewBox="0 0 40 40"
      role="img"
      aria-label="Votto"
      className={cn("block h-8 w-8", className)}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* rounded tile background */}
      <rect x="0.5" y="0.5" width="39" height="39" rx="11" fill={tile} />

      {/* left arm — institutional anchor */}
      <path
        d="M10.8 10.6 L20 28.6"
        stroke={anchor}
        strokeWidth="5.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* right arm — brand orange accent */}
      <path
        d="M20 28.6 L29.2 10.6"
        stroke="var(--color-accent-500)"
        strokeWidth="5.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
