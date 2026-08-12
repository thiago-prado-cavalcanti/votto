/**
 * Compact "Votação" breakdown for a theme: a stacked Sim / Não / Neutro bar
 * plus the per-option tallies. Colors use the dedicated vote tokens (moss /
 * brick / stone) so Sim and Não don't clash and abstention reads as neutral.
 */

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
  const pct = (n: number) => (total > 0 ? Math.round((n / total) * 100) : 0);
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-[var(--color-muted)]">
          Votação
        </span>
        <span className="text-xs text-[var(--color-muted)]">
          <span className="vt-num text-sm text-navy-800">{total.toLocaleString("pt-BR")}</span>{" "}
          {total === 1 ? "voto" : "votos"}
        </span>
      </div>
      <div className="mt-1.5 flex h-2 w-full overflow-hidden bg-navy-100">
        <div style={{ width: `${pct(yesCount)}%`, background: "var(--color-vote-yes)" }} />
        <div style={{ width: `${pct(noCount)}%`, background: "var(--color-vote-no)" }} />
        <div style={{ width: `${pct(absCount)}%`, background: "var(--color-vote-abstention)" }} />
      </div>
      <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--color-muted)]">
        <span>
          <span className="font-semibold text-[var(--color-vote-yes)]">Sim</span> {yesCount} (
          {pct(yesCount)}%)
        </span>
        <span>
          <span className="font-semibold text-[var(--color-vote-no)]">Não</span> {noCount} (
          {pct(noCount)}%)
        </span>
        <span>
          <span className="font-semibold text-[var(--color-vote-abstention)]">Neutro</span>{" "}
          {absCount} ({pct(absCount)}%)
        </span>
      </div>
    </div>
  );
}
