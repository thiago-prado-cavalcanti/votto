/**
 * Horizontal left↔right spectrum bar with five labeled bands and a marker placed
 * at the person's `spectrum` score (−100 = Esquerda … +100 = Direita).
 * Server-component friendly (no client hooks).
 */
import { SPECTRUM_BANDS } from "@/lib/indexes/positioning";

const BAND_COLORS: Record<string, string> = {
  esquerda: "var(--color-negative)",
  "centro-esquerda": "var(--color-neutral)",
  centro: "var(--color-muted)",
  "centro-direita": "var(--color-colonial-500)",
  direita: "var(--color-navy-600)",
};

export function SpectrumBar({
  spectrum,
  basis,
}: {
  /** −100..100 left↔right score */
  spectrum: number;
  /** number of votes backing the position; 0 → unavailable */
  basis: number;
}) {
  if (basis === 0) {
    return (
      <p className="text-xs text-[var(--color-muted)]">
        Sem dados de votação suficientes para posicionar.
      </p>
    );
  }

  // Map −100..100 to 0..100% across the bar.
  const pct = Math.max(0, Math.min(100, (spectrum + 100) / 2));

  return (
    <div className="w-full">
      <div className="relative h-2.5 w-full overflow-hidden rounded-full">
        <div className="grid h-full grid-cols-5">
          {SPECTRUM_BANDS.map((b) => (
            <div key={b.key} style={{ background: BAND_COLORS[b.key], opacity: 0.85 }} />
          ))}
        </div>
        {/* marker */}
        <div
          className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-navy-900 shadow"
          style={{ left: `${pct}%` }}
          aria-hidden
        />
      </div>
      <div className="mt-1.5 flex justify-between text-[10px] text-[var(--color-muted)]">
        <span>Esquerda</span>
        <span>Centro</span>
        <span>Direita</span>
      </div>
    </div>
  );
}
