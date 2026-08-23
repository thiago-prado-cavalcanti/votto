/**
 * IndexPlate — the standing box of figures beside a page masthead.
 *
 * A front page sets the shape of the story next to the headline, and that is all
 * this is: label · bar · figure, one row per cut, hairline between rows, the
 * whole thing hung under a 2px ink rule. It is `StatStrip`'s grammar turned on
 * its side — a strip compares four unrelated totals, a plate compares the parts
 * of one total, so the bars are what carry the reading and the figures confirm it.
 *
 * The bars are always relative to the largest row, never to the sum: a page whose
 * agenda is 90% "tramitação normal" must still show the four urgent bills as a
 * visible mark, otherwise the plate says nothing on exactly the pages where the
 * shape is most lopsided.
 *
 * Inside a revealed block the bars enter from the left, one after the other, on
 * the system's `.vt-grow`; outside one it renders finished (docs/design.md §5).
 * Server-component friendly — no client hooks.
 */
import type { CSSProperties } from "react";

export interface IndexPlateRow {
  label: string;
  value: number;
  /** Bar pigment. Defaults to ink. */
  color?: string;
}

/**
 * Delay of a row's bar. Starts after the masthead's own beats so the plate
 * finishes arriving as the reader reaches the headline, not before it.
 */
const rowBeat = (i: number) => ({ "--vt-d": `${360 + i * 90}ms` }) as CSSProperties;

export function IndexPlate({
  caption,
  note,
  hint,
  rows,
}: {
  /** What the rows cut the subject by — "Por prioridade", "Maiores bancadas". */
  caption: string;
  /** The universe the cut is taken from — "1.284 temas". */
  note?: string;
  /**
   * What the universe leaves out, when it leaves something out.
   *
   * A cut of a filtered set prints a total that is smaller than the archive, and
   * without this the figure reads as the whole holding. `/temas` hides concluded
   * bills by default: the plate said "7.041 temas" while the platform held 8.000,
   * and the home — counting the archive — announced the larger number, so the
   * two pages disagreed with no explanation between them.
   */
  hint?: React.ReactNode;
  rows: IndexPlateRow[];
}) {
  const max = Math.max(...rows.map((r) => r.value), 1);

  return (
    <figure className="border-t-2 border-navy-900">
      <figcaption className="flex items-baseline justify-between gap-4 pb-3 pt-2.5">
        <span className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-navy-600">
          {caption}
        </span>
        {note ? <span className="text-xs text-[var(--color-muted)]">{note}</span> : null}
      </figcaption>

      <ul>
        {rows.map((row, i) => (
          <li
            key={row.label}
            className="grid grid-cols-[minmax(0,1fr)_5.5rem_auto] items-center gap-3 border-t border-line py-2.5 sm:grid-cols-[minmax(0,1fr)_7rem_auto]"
          >
            <span className="truncate text-[0.82rem] text-navy-700">{row.label}</span>
            {/* The track is the rule pigment, not the tint: the plate hangs in a
                masthead band that is itself off-white, and a lighter track
                disappeared into it. */}
            <span className="block h-1.5 w-full bg-navy-200">
              <span
                className="vt-grow block h-full"
                style={{
                  ...rowBeat(i),
                  // A row that exists is never a bar of nothing: three deputies
                  // out of five hundred still get a visible mark.
                  width: row.value > 0 ? `${Math.max(3, Math.round((row.value / max) * 100))}%` : 0,
                  background: row.color ?? "var(--color-navy-800)",
                }}
              />
            </span>
            <span className="vt-num min-w-[2.25rem] text-right text-[1.05rem] leading-none text-navy-900">
              {row.value.toLocaleString("pt-BR")}
            </span>
          </li>
        ))}
      </ul>

      {hint ? (
        <p className="border-t border-line pt-2 text-[0.7rem] leading-relaxed text-[var(--color-muted)]">
          {hint}
        </p>
      ) : null}
    </figure>
  );
}
