/**
 * Votto standalone mark.
 *
 * Concept: a bold geometric "V" that doubles as a ballot check / "vote yes"
 * gesture. The left arm is the heavy institutional anchor (teal/ink); the right
 * arm kicks up past the meeting point into a confident checkmark rendered in
 * brand orange — the energetic accent. Drawn with thick rounded strokes so it
 * stays crisp and resolution-independent at any size.
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

      {/* left arm of the V — institutional anchor */}
      <path
        d="M11 11 L19.5 28"
        stroke={anchor}
        strokeWidth="5.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* right arm rising into a check — brand orange accent */}
      <path
        d="M19.5 28 L24.2 18.5 L30.5 9.5"
        stroke="var(--color-accent-500)"
        strokeWidth="5.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
