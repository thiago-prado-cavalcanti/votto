/**
 * Votto wordmark used in the header and footer.
 *
 * Pairs the geometric V/check mark (see {@link Logo}) with a heavy, tightly
 * tracked "Votto" wordmark rendered as inline SVG so it stays crisp at any
 * size and renders correctly even before the Sora webfont loads. An orange
 * accent dot ties the wordmark back to the brand mark.
 *
 * The `tone` prop adapts the wordmark for a light header (`"light"`) or a
 * dark ink/teal footer (`"dark"`).
 */
import Link from "next/link";
import { cn } from "@/lib/cn";
import { Logo } from "./Logo";

type Tone = "light" | "dark";

const FONT_STACK =
  "var(--font-sora), var(--font-display), ui-sans-serif, system-ui, sans-serif";

const WORDMARK_COLOR: Record<Tone, string> = {
  light: "var(--color-navy-900)",
  dark: "#ffffff",
};

export function Wordmark({
  className,
  tone = "light",
}: {
  className?: string;
  tone?: Tone;
}) {
  return (
    <Link
      href="/"
      aria-label="Votto — início"
      className={cn(
        "group inline-flex items-center gap-2.5 transition-opacity hover:opacity-90",
        className,
      )}
    >
      <Logo
        tone={tone}
        className="h-8 w-8 shrink-0 transition-transform duration-200 ease-out group-hover:-translate-y-0.5"
      />
      <svg
        viewBox="0 0 152 34"
        height="26"
        role="img"
        aria-hidden="true"
        className="block h-[26px] w-auto"
        xmlns="http://www.w3.org/2000/svg"
      >
        <text
          x="0"
          y="27"
          fontFamily={FONT_STACK}
          fontSize="32"
          fontWeight={800}
          letterSpacing="-1.4"
          fill={WORDMARK_COLOR[tone]}
        >
          Votto
        </text>
        <circle
          cx="146"
          cy="9"
          r="3.4"
          fill="var(--color-accent-500)"
          className="transition-colors duration-200 group-hover:fill-[var(--color-accent-600)]"
        />
      </svg>
    </Link>
  );
}
