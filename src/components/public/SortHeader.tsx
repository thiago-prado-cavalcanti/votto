/**
 * The ordering control that sits at the head of a list of public agents.
 *
 * It is a header, not a filter. The filters above say *which* agents you are
 * looking at; this says which reading ranks them — and the three readings answer
 * different questions, so none is a narrowing of another. Putting it in the
 * filter bar made it look like a fourth way to cut the bench.
 *
 * The active option carries an arrow, and following it again turns the arrow
 * over. Every option defaults to descending, because on all three readings the
 * interesting end is the top; ascending exists so "who is worst" is one click
 * away rather than a scroll to the end.
 *
 * **This is the control for a list of cards, and only that.** A card grid has no
 * column to hang the ordering on, so the choice needs a row of its own. A table
 * does have one, and there the ordering belongs in the column heads — a separate
 * row above them would spend a band of paper restating the labels already
 * printed beneath it (`RankingTabs`).
 *
 * Options are anchors, always: the lists this heads are paginated on the server,
 * so the ordering has to live in the URL for page two to agree with page one.
 * That also keeps this a server component — it renders as ink, ships no
 * JavaScript, and works with none.
 */
import { cn } from "@/lib/cn";
import { SortArrow, type SortDirection } from "@/components/public/SortArrow";

export type { SortDirection };

export interface SortOption {
  key: string;
  label: string;
  /**
   * Where following this option goes, already built.
   *
   * A URL and not a builder function, because a server component cannot hand a
   * function to a client one — the props have to survive serialization. The
   * toggle logic therefore lives with whoever builds these.
   */
  href: string;
}

export function SortHeader({
  options,
  active,
  direction,
  className,
}: {
  options: SortOption[];
  active: string;
  direction: SortDirection;
  className?: string;
}) {
  if (options.length === 0) return null;

  return (
    <div
      className={cn(
        // No rule of its own, and neither has the filter bar it sits under:
        // a border here, with the filter's bottom margin above it, read as an
        // empty band rather than as structure.
        "flex flex-wrap items-baseline gap-x-5 gap-y-1 py-2.5 text-[0.72rem]",
        className,
      )}
    >
      <span className="font-semibold uppercase tracking-[0.14em] text-[var(--color-muted)]">
        Ordenar por
      </span>
      {options.map((option) => {
        const isActive = option.key === active;
        return (
          <a
            key={option.key}
            href={option.href}
            className={cn(
              "inline-flex items-center gap-1 transition-colors",
              isActive
                ? "font-semibold text-navy-900"
                : "text-navy-600 hover:text-navy-900",
            )}
          >
            {option.label}
            {/* The inactive options keep a placeholder of the same width, so
                the row does not shift sideways as the choice moves along it. */}
            <SortArrow direction={isActive ? direction : null} />
          </a>
        );
      })}
    </div>
  );
}
