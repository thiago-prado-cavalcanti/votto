/**
 * Votto wordmark — the logotype, and the whole logo.
 *
 * There is no accompanying mark: the brand is the word, set in the display serif
 * with a terracota italic period closing it. The period is the only pigment, and
 * it is what makes the wordmark a logotype rather than a heading — so it is never
 * dropped, and never restated in another colour.
 *
 * Set as live text (not SVG) so it inherits the loaded Newsreader and stays
 * selectable and accessible. Weight 700 is the single exception to the "no 700
 * in the system" rule (docs/design.md §3): a logotype is drawn, not composed, and
 * at 700 the word holds its own against the 1px rule under the masthead.
 *
 * `tone` adapts it for the light masthead (`"light"`) or the dark ink footer
 * (`"dark"`); the period keeps its terracota in both. `newTab` is for the embed
 * widgets, which live in an iframe and must break out of it to reach the site.
 */
import Link from "next/link";
import { cn } from "@/lib/cn";

type Tone = "light" | "dark";

const WORDMARK_COLOR: Record<Tone, string> = {
  light: "text-navy-900",
  dark: "text-navy-50",
};

export function Wordmark({
  className,
  tone = "light",
  newTab = false,
}: {
  className?: string;
  tone?: Tone;
  newTab?: boolean;
}) {
  return (
    <Link
      href="/"
      aria-label="Votto — início"
      {...(newTab ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      className={cn(
        // `.vt-wordmark` (globals.css) owns the face, the 700 weight and the
        // tracking. It cannot be expressed with Tailwind utilities here: the
        // unlayered `.font-display` rule outranks any utility, so `font-bold`
        // would be dropped and the logotype would render at 500.
        "vt-wordmark inline-block text-[1.6rem] transition-opacity hover:opacity-80",
        WORDMARK_COLOR[tone],
        className,
      )}
    >
      Votto
      <em className="text-accent-500">.</em>
    </Link>
  );
}
