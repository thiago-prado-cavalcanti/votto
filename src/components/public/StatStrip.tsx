/**
 * Responsive strip of headline statistics (themes, agents, parties, votes).
 *
 * No boxes: the figures sit between two rules and are separated by vertical
 * hairlines, the figure first and its label underneath in small caps — a masthead
 * of numbers rather than four cards (docs/design.md).
 *
 * The columns arrive one after the other and a numeric figure tallies up to its
 * value, which is the one place on the site where a number is allowed to move:
 * these four are the platform's headline, and counting is how a headline figure
 * announces itself. A `value` that is not a number is printed as given.
 */
import { Reveal, CountUp } from "@/components/public/motion";
import { cn } from "@/lib/cn";

export function StatStrip({
  items,
}: {
  items: Array<{ label: string; value: number | React.ReactNode; hint?: string }>;
}) {
  return (
    <Reveal
      variant="fade"
      stagger
      step={110}
      className="grid grid-cols-2 gap-y-7 border-y border-line py-7 sm:grid-cols-4 sm:divide-x sm:divide-[var(--color-line)]"
    >
      {items.map((item, i) => (
        <div key={item.label} className={cn("sm:px-7", i === 0 && "sm:pl-0")}>
          <div className="vt-num text-[2.1rem] leading-none text-navy-900">
            {typeof item.value === "number" ? <CountUp value={item.value} /> : item.value}
          </div>
          <div className="mt-2 text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-[var(--color-muted)]">
            {item.label}
          </div>
          {item.hint ? (
            <div className="mt-1 text-xs text-[var(--color-muted)]">{item.hint}</div>
          ) : null}
        </div>
      ))}
    </Reveal>
  );
}
