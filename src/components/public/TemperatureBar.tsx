/**
 * Visual indicator for a theme's "temperature" (engagement, 0–100) plus a compact
 * breakdown of the Sim / Não / Abstenção tallies.
 */

export function TemperatureBar({
  temperature,
  yesCount,
  noCount,
  absCount,
}: {
  temperature: number;
  yesCount: number;
  noCount: number;
  absCount: number;
}) {
  const total = yesCount + noCount + absCount;
  const pct = (n: number) => (total > 0 ? Math.round((n / total) * 100) : 0);
  return (
    <div>
      <div className="flex items-center justify-between text-xs">
        <span className="text-[var(--color-muted)]">Temperatura</span>
        <span className="font-semibold text-colonial-700">{temperature}°</span>
      </div>
      <div className="mt-1 flex h-2 w-full overflow-hidden rounded-full bg-[#eef1f5]">
        <div style={{ width: `${pct(yesCount)}%`, background: "var(--color-positive)" }} />
        <div style={{ width: `${pct(noCount)}%`, background: "var(--color-negative)" }} />
        <div style={{ width: `${pct(absCount)}%`, background: "var(--color-neutral)" }} />
      </div>
      <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--color-muted)]">
        <span>
          <span className="font-medium text-[var(--color-positive)]">Sim</span> {yesCount} (
          {pct(yesCount)}%)
        </span>
        <span>
          <span className="font-medium text-[var(--color-negative)]">Não</span> {noCount} (
          {pct(noCount)}%)
        </span>
        <span>
          <span className="font-medium text-[var(--color-neutral)]">Abstenção</span> {absCount} (
          {pct(absCount)}%)
        </span>
      </div>
    </div>
  );
}
