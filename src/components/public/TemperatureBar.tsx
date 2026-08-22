/**
 * The result of a theme's popular vote, as a voting panel.
 *
 * Voting is the platform's main action and the tally is its main reading, so the
 * panel leads with the figure that answers the question — the winning option's
 * share, set large in the serif tabular numerals.
 *
 * Under it the split stays a **rectangle**, and deliberately so: this bar is the
 * measurement, and a drawn, organic edge would blur exactly the boundary the
 * reader is trying to see. It softens only at its two ends. The panel's
 * conversation with the hero's radar is carried by everything around it — the
 * warm ground it sits on, the vertex dots that key the tally, the pigment-tinted
 * ballot — never by the bar.
 *
 * Colors are the vote tokens (moss / brick / stone) so Sim and Não never clash
 * and abstention always reads as neutral. With no votes cast the panel says so
 * and invites the first one, rather than printing three zeroes.
 *
 * Inside a revealed block the whole bar wipes in from the left as one object —
 * scaling the shares individually would open gaps between them mid-flight — and
 * the reading and tally arrive behind it. Outside one (the embed widgets) it
 * renders finished.
 */
import type { CSSProperties } from "react";
import { cn } from "@/lib/cn";

const OPTIONS = [
  { key: "yes", label: "Sim", color: "var(--color-vote-yes)" },
  { key: "no", label: "Não", color: "var(--color-vote-no)" },
  { key: "abs", label: "Neutro", color: "var(--color-vote-abstention)" },
] as const;

export function TemperatureBar({
  yesCount,
  noCount,
  absCount,
}: {
  yesCount: number;
  noCount: number;
  absCount: number;
}) {
  const total = yesCount + noCount + absCount;
  const counts = { yes: yesCount, no: noCount, abs: absCount };
  const pct = (n: number) => (total > 0 ? Math.round((n / total) * 100) : 0);

  // The reading: the option ahead, or a tie when the top two are level.
  const ranked = [...OPTIONS].sort((a, b) => counts[b.key] - counts[a.key]);
  const leader = ranked[0];
  const tied = total > 0 && counts[ranked[1].key] === counts[leader.key];

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-[var(--color-muted)]">
          Votação
        </span>
        <span className="text-xs text-[var(--color-muted)]">
          <span className="vt-num text-sm text-navy-800">{total.toLocaleString("pt-BR")}</span>{" "}
          {total === 1 ? "voto" : "votos"}
        </span>
      </div>

      {total === 0 ? (
        <p className="vt-fade mt-2 text-sm leading-snug text-[var(--color-muted)]">
          Ainda sem votos.{" "}
          <span className="text-[var(--color-accent-600)]">Seja o primeiro a se posicionar.</span>
        </p>
      ) : (
        <div
          className="vt-fade mt-1.5 flex items-baseline gap-2"
          style={{ "--vt-d": "300ms" } as CSSProperties}
        >
          <span
            className="vt-num text-[2.4rem] leading-none"
            style={{ color: tied ? "var(--color-vote-abstention)" : leader.color }}
          >
            {pct(counts[leader.key])}%
          </span>
          <span
            className="text-sm font-semibold"
            style={{ color: tied ? "var(--color-muted)" : leader.color }}
          >
            {tied ? "empate" : leader.label}
          </span>
        </div>
      )}

      {/* The measurement: solid pigment, square joins, a paper fold between the
          shares. A thin rule of a bar, with the tag's 2px corner — barely off
          square, because a measurement should not look like a pill. */}
      <div className="mt-2.5 h-2 w-full overflow-hidden rounded-[2px] bg-[var(--color-line)]">
        <div className="vt-grow flex h-full w-full gap-px">
          {OPTIONS.map((o) => (
            <div key={o.key} style={{ width: `${pct(counts[o.key])}%`, background: o.color }} />
          ))}
        </div>
      </div>

      {/* The tally: three columns keyed by the radar's vertex dot.
          
          It renders even at zero, and that is a correction. Skipping it read
          well on a single theme — three zeroes add nothing the invitation above
          has not already said — but the lists are where this panel actually
          lives, and there almost every theme is untouched: on `/temas` the
          block collapsed on 59 rows out of 60 while the home, which shows only
          the most-voted six, always had it. Same component, two shapes, and a
          ragged column of ballots sitting at different heights.
          
          So the shape is constant and the *weight* carries the difference: with
          votes the figures are ink, without them they recede to muted, which
          reads as a panel at rest rather than a result of zero. */}
      <div
        className="vt-fade mt-3 grid grid-cols-3 gap-x-3"
        style={{ "--vt-d": "420ms" } as CSSProperties}
      >
          {OPTIONS.map((o) => (
            <div key={o.key}>
              <div className="flex items-center gap-1.5">
                <span
                  className="size-[5px] shrink-0 rounded-full"
                  style={{ background: o.color }}
                  aria-hidden="true"
                />
                <span className="text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-[var(--color-muted)]">
                  {o.label}
                </span>
              </div>
              <div className="mt-0.5 flex items-baseline gap-1.5">
                <span
                  className={cn(
                    "vt-num text-base",
                    total > 0 ? "text-navy-900" : "text-[var(--color-muted)]",
                  )}
                >
                  {counts[o.key].toLocaleString("pt-BR")}
                </span>
                <span className="text-[0.68rem] text-[var(--color-muted)]">
                  {pct(counts[o.key])}%
                </span>
              </div>
            </div>
          ))}
        </div>
    </div>
  );
}
