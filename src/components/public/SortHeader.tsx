"use client";

/**
 * The ordering control that sits at the head of a list of public agents.
 *
 * It is a header, not a filter. The filters above say *which* agents you are
 * looking at; this says which reading ranks them — and the three readings answer
 * different questions, so none is a narrowing of another. Putting it in the
 * filter bar made it look like a fourth way to cut the bench.
 *
 * The active option carries an arrow, and clicking it again turns the arrow
 * over. Every option defaults to descending, because on all three readings the
 * interesting end is the top; ascending exists so "who is worst" is one click
 * away rather than a scroll to the end.
 *
 * `href` renders anchors, for a list the server paginates — the ordering has to
 * live in the URL so page two agrees with page one. Without it the control is
 * local state, for a table already holding every row it ranks.
 */
import { cn } from "@/lib/cn";

export type SortDirection = "asc" | "desc";

export interface SortOption {
  key: string;
  label: string;
  /**
   * Linked mode: where clicking this option goes, already built.
   *
   * A URL and not a builder function, because a server component cannot hand a
   * function to a client one — the props have to survive serialization. The
   * toggle logic therefore lives with whoever builds these.
   */
  href?: string;
}

export function SortHeader({
  options,
  active,
  direction,
  onChange,
  className,
}: {
  options: SortOption[];
  active: string;
  direction: SortDirection;
  /** Local mode: the table re-sorts in place. Ignored where options carry `href`. */
  onChange?: (key: string, direction: SortDirection) => void;
  className?: string;
}) {
  if (options.length === 0) return null;

  // Clicking the option already in force turns the arrow over; clicking another
  // starts it descending, which is the end anybody asks for first.
  const nextFor = (key: string): SortDirection =>
    key === active ? (direction === "desc" ? "asc" : "desc") : "desc";

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
        const content = (
          <>
            {option.label}
            <Arrow
              // The inactive options keep a placeholder of the same width, so
              // the row does not shift sideways as the choice moves along it.
              direction={isActive ? direction : null}
            />
          </>
        );
        const classes = cn(
          "inline-flex items-center gap-1 transition-colors",
          isActive
            ? "font-semibold text-navy-900"
            : "text-navy-600 hover:text-navy-900",
        );

        return option.href ? (
          <a key={option.key} href={option.href} className={classes}>
            {content}
          </a>
        ) : (
          <button
            key={option.key}
            type="button"
            onClick={() => onChange?.(option.key, nextFor(option.key))}
            aria-pressed={isActive}
            className={classes}
          >
            {content}
          </button>
        );
      })}
    </div>
  );
}

function Arrow({ direction }: { direction: SortDirection | null }) {
  return (
    <svg
      width="9"
      height="9"
      viewBox="0 0 10 10"
      aria-hidden="true"
      className={cn("shrink-0", direction ? "text-navy-900" : "invisible")}
    >
      <path
        d={direction === "asc" ? "M5 8.5V2M2 4.6 5 1.5l3 3.1" : "M5 1.5V8M2 5.4 5 8.5l3-3.1"}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
