/**
 * Delightful left↔right spectrum gauge (SVG). A smooth multi-stop gradient track
 * with five soft band ticks, a glowing marker and a floating label bubble placed
 * at the person's `spectrum` score (−100 = Esquerda … +100 = Direita).
 * Server-component friendly (no client hooks).
 */
import { deriveBand } from "@/lib/indexes/positioning";

const BAND_COLOR: Record<string, string> = {
  esquerda: "var(--color-negative)",
  "centro-esquerda": "var(--color-neutral)",
  centro: "#7d8a88",
  "centro-direita": "var(--color-colonial-500)",
  direita: "var(--color-navy-900)",
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

  const W = 320;
  const H = 84;
  const pad = 18;
  const trackY = 52;
  const trackH = 14;
  const span = W - pad * 2;

  const clamped = Math.max(-100, Math.min(100, spectrum));
  const pct = (clamped + 100) / 200;
  const x = pad + pct * span;

  const band = deriveBand(clamped);
  const color = BAND_COLOR[band.key] ?? "#7d8a88";

  // Floating label bubble, clamped so it stays inside the viewBox.
  const bubbleW = Math.max(74, band.label.length * 7.2 + 24);
  const bubbleX = Math.max(pad, Math.min(W - pad - bubbleW, x - bubbleW / 2));

  // Band boundaries at spectrum −50, −15, 15, 50 → x positions for subtle ticks.
  const ticks = [-50, -15, 15, 50].map((s) => pad + ((s + 100) / 200) * span);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full"
      role="img"
      aria-label={`Posicionamento: ${band.label}`}
    >
      <defs>
        <linearGradient id="vt-spectrum" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="var(--color-negative)" />
          <stop offset="27%" stopColor="var(--color-neutral)" />
          <stop offset="50%" stopColor="#9aa3a1" />
          <stop offset="73%" stopColor="var(--color-colonial-500)" />
          <stop offset="100%" stopColor="var(--color-navy-900)" />
        </linearGradient>
        <filter id="vt-glow" x="-60%" y="-60%" width="220%" height="220%">
          <feDropShadow dx="0" dy="3" stdDeviation="4" floodColor={color} floodOpacity="0.55" />
        </filter>
      </defs>

      {/* Track */}
      <rect
        x={pad}
        y={trackY}
        width={span}
        height={trackH}
        rx={trackH / 2}
        fill="url(#vt-spectrum)"
      />
      {/* Soft band dividers */}
      {ticks.map((tx, i) => (
        <line
          key={i}
          x1={tx}
          y1={trackY + 2}
          x2={tx}
          y2={trackY + trackH - 2}
          stroke="white"
          strokeOpacity="0.35"
          strokeWidth="1.5"
        />
      ))}

      {/* Marker */}
      <g filter="url(#vt-glow)">
        <circle cx={x} cy={trackY + trackH / 2} r="11" fill="white" />
        <circle cx={x} cy={trackY + trackH / 2} r="7.5" fill={color} />
      </g>

      {/* Floating label bubble */}
      <g>
        <rect x={bubbleX} y={16} width={bubbleW} height={24} rx={12} fill={color} />
        <text
          x={bubbleX + bubbleW / 2}
          y={32}
          textAnchor="middle"
          fontSize="12.5"
          fontWeight="700"
          fill="white"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {band.label}
        </text>
      </g>

      {/* Endpoint labels */}
      <text x={pad} y={H - 6} fontSize="10.5" fontWeight="600" fill="var(--color-muted)">
        Esquerda
      </text>
      <text
        x={W / 2}
        y={H - 6}
        fontSize="10.5"
        fontWeight="600"
        fill="var(--color-muted)"
        textAnchor="middle"
      >
        Centro
      </text>
      <text
        x={W - pad}
        y={H - 6}
        fontSize="10.5"
        fontWeight="600"
        fill="var(--color-muted)"
        textAnchor="end"
      >
        Direita
      </text>
    </svg>
  );
}
