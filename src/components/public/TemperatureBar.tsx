/**
 * Compact "Votação" breakdown for a theme: a stacked Sim / Não / Abstenção bar
 * plus the per-option tallies. Colors use the dedicated vote tokens (emerald /
 * crimson / slate) so Sim and Não don't clash and abstention reads as neutral.
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
      <div className="flex items-center justify-between text-xs">
        <span className="font-semibold text-navy-800">Votação</span>
        <span className="text-[var(--color-muted)]">
          {total.toLocaleString("pt-BR")} {total === 1 ? "voto" : "votos"}
        </span>
      </div>
      <div className="mt-1.5 flex h-2.5 w-full overflow-hidden rounded-full bg-[#e7eae8]">
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
          <span className="font-semibold text-[var(--color-vote-abstention)]">Abstenção</span>{" "}
          {absCount} ({pct(absCount)}%)
        </span>
      </div>
    </div>
  );
}
