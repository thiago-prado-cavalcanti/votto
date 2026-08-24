/**
 * The arrow that marks which reading a list is ordered by, and which way.
 *
 * One glyph for the two places ordering is offered — the header row above a
 * list of cards (`SortHeader`) and the column heads of the ranking table
 * (`RankingTabs`). Two copies of a 9px mark would drift in stroke and size
 * long before anybody noticed.
 *
 * `direction: null` keeps the arrow in the layout and hides it, so a row of
 * options does not shift sideways as the choice moves along it.
 */
import { cn } from "@/lib/cn";

export type SortDirection = "asc" | "desc";

export function SortArrow({
  direction,
  className,
}: {
  direction: SortDirection | null;
  className?: string;
}) {
  return (
    <svg
      width="9"
      height="9"
      viewBox="0 0 10 10"
      aria-hidden="true"
      className={cn("shrink-0", direction ? null : "invisible", className)}
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
