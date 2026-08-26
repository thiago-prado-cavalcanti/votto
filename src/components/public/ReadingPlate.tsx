/**
 * ReadingPlate — the index readings of one record, set as a masthead figure.
 *
 * Same plate grammar as `IndexPlate` (2px ink rule, small-caps caption, hairline
 * between entries), but where the index plate compares many rows, this one gives
 * a single reading the size it deserves: the alignment percentage is what a
 * citizen opens an agent's page for, and printed at 14px inside a sidebar card it
 * read as a footnote to the biography. Here it is the figure the headline is set
 * against, in the serif tabular numerals and the three earth pigments of the
 * index scale (`src/lib/domain/tone.ts`).
 *
 * A reading with no value is not hidden — it says why it is missing, because
 * "not enough shared themes yet" is itself information about the platform.
 *
 * **A lone reading does not repeat the caption.** The caption names the plate and
 * each label names one reading among several; with a single reading the two are
 * the same sentence, and the agent record printed "COM OS ELEITORES" twice, one
 * under the other. The label still exists — it is the React key, and it is what
 * distinguishes rows the day a plate carries more than one.
 *
 * Server-component friendly (no client hooks); the bars are armed by whatever
 * `.vt-reveal` block the plate is dropped into.
 */
import type { CSSProperties } from "react";
import { Bar } from "@/components/ui/Bar";
import { alignmentInk, alignmentTone } from "@/lib/domain/tone";

export interface Reading {
  label: string;
  /** 0–100, or null when there is not enough data to compute it. */
  value: number | null;
  /** What the reading is based on — or, when it is null, why there isn't one. */
  hint?: React.ReactNode;
}

export function ReadingPlate({
  caption,
  readings,
}: {
  caption: string;
  readings: Reading[];
}) {
  return (
    <figure className="border-t-2 border-navy-900">
      <figcaption className="pb-3 pt-2.5 text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-navy-600">
        {caption}
      </figcaption>

      {readings.map((reading, i) => {
        const pct = reading.value === null ? null : Math.max(0, Math.min(100, Math.round(reading.value)));
        const beat = { "--vt-d": `${360 + i * 140}ms` } as CSSProperties;

        return (
          <div key={reading.label} className="border-t border-line py-4">
            {readings.length > 1 ? (
              <div className="text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-[var(--color-muted)]">
                {reading.label}
              </div>
            ) : null}

            {pct === null ? (
              <p className="mt-2 text-sm leading-relaxed text-[var(--color-muted)]">
                {reading.hint ?? "Sem dados suficientes."}
              </p>
            ) : (
              <>
                <div
                  className="vt-num vt-fade mt-1.5 text-[2.7rem] leading-none"
                  style={{ ...beat, color: alignmentInk(pct) }}
                >
                  {pct}
                  <span className="text-[1.35rem]">%</span>
                </div>
                <div className="mt-3">
                  <Bar
                    style={beat}
                    segments={[{ key: "v", width: pct, color: alignmentTone(pct) }]}
                  />
                </div>
                {reading.hint ? (
                  <p className="mt-2.5 text-xs leading-relaxed text-[var(--color-muted)]">
                    {reading.hint}
                  </p>
                ) : null}
              </>
            )}
          </div>
        );
      })}
    </figure>
  );
}
