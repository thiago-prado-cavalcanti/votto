/**
 * QualityPlate — the four pillars behind an agent's quality index.
 *
 * `IndexPlate`'s grammar (label · bar · figure, hairline between rows, hung
 * under a 2px ink rule), with one difference that is not cosmetic: each row
 * carries **the raw reading**, not the ranked score.
 *
 * That is a requirement of the index, not a design preference. Every pillar is a
 * percentile inside a peer group, which manufactures a uniform distribution:
 * half of any parliament sits below 50, and the gap between the 40th and the
 * 60th may be two sittings. The bar shows where the agent stands among their
 * peers; the figure beside it — "92% · 312 de 340 votações" — is the fact the
 * rank was computed from, and it is what a citizen actually reads. Printing the
 * percentile alone would state a difference the data may not contain.
 *
 * A pillar with nothing to show says so. It never renders as zero: an agent we
 * could not measure is not an agent who scored badly (CLAUDE.md §3.3).
 *
 * Server-component friendly — no client hooks.
 */
import type { CSSProperties } from "react";
import { alignmentTone } from "@/lib/domain/tone";
import type { QualityPillarResult } from "@/lib/indexes/quality";

/** Rows enter after the card's own beats, one after the other. */
const rowBeat = (i: number) => ({ "--vt-d": `${360 + i * 90}ms` }) as CSSProperties;

export function QualityPlate({
  pillars,
  caption = "Como o índice é formado",
  note,
}: {
  pillars: QualityPillarResult[];
  caption?: string;
  note?: string;
}) {
  return (
    <figure className="border-t-2 border-navy-900">
      <figcaption className="flex items-baseline justify-between gap-4 pb-3 pt-2.5">
        <span className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-navy-600">
          {caption}
        </span>
        {note ? <span className="text-xs text-[var(--color-muted)]">{note}</span> : null}
      </figcaption>

      <ul>
        {pillars.map((pillar, i) => (
          <li key={pillar.key} className="border-t border-line py-2.5">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[0.82rem] text-navy-700">{pillar.label}</span>
              {pillar.reading ? (
                <span className="vt-num text-[1.05rem] leading-none text-navy-900">
                  {pillar.reading.value}
                </span>
              ) : (
                <span className="text-xs text-[var(--color-muted)]">sem dados</span>
              )}
            </div>

            <div className="mt-1.5 flex items-center gap-3">
              <span className="block h-1.5 w-full bg-navy-200">
                {pillar.score !== null ? (
                  <span
                    className="vt-grow block h-full"
                    style={{
                      ...rowBeat(i),
                      // A pillar that scored is never a bar of nothing: being at
                      // the bottom of a cohort is still a reading.
                      width: `${Math.max(3, pillar.score)}%`,
                      background: alignmentTone(pillar.score),
                    }}
                  />
                ) : null}
              </span>
              <span className="shrink-0 text-[0.7rem] tabular-nums text-[var(--color-muted)]">
                {pillar.score !== null ? `${pillar.score}º percentil` : "—"}
              </span>
            </div>

            {pillar.reading?.detail ? (
              <p className="mt-1 text-xs text-[var(--color-muted)]">{pillar.reading.detail}</p>
            ) : null}
          </li>
        ))}
      </ul>

      {/* The distinction the index would be lying about if it left it implicit. */}
      <p className="border-t border-line pt-2.5 text-xs leading-relaxed text-[var(--color-muted)]">
        O custo político é a média mensal da cota parlamentar: gabinete, viagens, combustível,
        divulgação e segurança. Não inclui emendas nem verba destinada a projetos — recursos que o
        parlamentar traz para políticas públicas não são despesa dele.
      </p>
    </figure>
  );
}
