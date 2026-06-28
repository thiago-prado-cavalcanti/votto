/**
 * Delightful two-axis positioning chart (SVG). Plots a single point on the
 * Estado↔Mercado (x) and Comunidade↔Indivíduo (y) axes (−100..100), over a soft
 * tinted-quadrant radar with concentric rings, a vector from the center and a
 * glowing accent marker. Server-component friendly (no client hooks).
 */
import { POSITIONING_AXES } from "@/lib/indexes/positioning";

export function PositioningChart({
  economic,
  social,
  basis,
}: {
  economic: number;
  social: number;
  basis: number;
}) {
  const S = 300;
  const pad = 34;
  const span = S - pad * 2;
  const mid = S / 2;

  // x: economic (−100 → left, +100 → right); y: social (+100 → top, −100 → bottom)
  const cx = pad + ((economic + 100) / 200) * span;
  const cy = pad + ((100 - social) / 200) * span;

  return (
    <svg
      viewBox={`0 0 ${S} ${S}`}
      className="mx-auto w-full max-w-[340px]"
      role="img"
      aria-label="Gráfico de posicionamento em dois eixos"
    >
      <defs>
        <radialGradient id="vt-pt-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="var(--color-accent-500)" stopOpacity="0.55" />
          <stop offset="100%" stopColor="var(--color-accent-500)" stopOpacity="0" />
        </radialGradient>
        <filter id="vt-pt-shadow" x="-60%" y="-60%" width="220%" height="220%">
          <feDropShadow dx="0" dy="3" stdDeviation="4" floodColor="#1b2026" floodOpacity="0.28" />
        </filter>
        <clipPath id="vt-plot">
          <rect x={pad} y={pad} width={span} height={span} rx="18" />
        </clipPath>
      </defs>

      {/* Plot surface */}
      <rect
        x={pad}
        y={pad}
        width={span}
        height={span}
        rx="18"
        fill="#fbfbfa"
        stroke="var(--color-line)"
      />

      {/* Quadrant tints */}
      <g clipPath="url(#vt-plot)" opacity="0.1">
        <rect x={mid} y={pad} width={span / 2} height={span / 2} fill="var(--color-accent-500)" />
        <rect x={pad} y={pad} width={span / 2} height={span / 2} fill="var(--color-colonial-500)" />
        <rect x={pad} y={mid} width={span / 2} height={span / 2} fill="var(--color-navy-700)" />
        <rect x={mid} y={mid} width={span / 2} height={span / 2} fill="var(--color-neutral)" />
      </g>

      {/* Concentric rings */}
      <g clipPath="url(#vt-plot)" stroke="var(--color-line)" fill="none">
        <circle cx={mid} cy={mid} r={span / 6} />
        <circle cx={mid} cy={mid} r={span / 3} />
        <circle cx={mid} cy={mid} r={span / 2.25} />
      </g>

      {/* Axes */}
      <line x1={mid} y1={pad} x2={mid} y2={S - pad} stroke="var(--color-navy-200)" strokeWidth="1.5" />
      <line x1={pad} y1={mid} x2={S - pad} y2={mid} stroke="var(--color-navy-200)" strokeWidth="1.5" />

      {/* Vector + point */}
      {basis > 0 ? (
        <>
          <line
            x1={mid}
            y1={mid}
            x2={cx}
            y2={cy}
            stroke="var(--color-accent-500)"
            strokeWidth="2.5"
            strokeLinecap="round"
            opacity="0.6"
          />
          <circle cx={cx} cy={cy} r="26" fill="url(#vt-pt-glow)" />
          <g filter="url(#vt-pt-shadow)">
            <circle cx={cx} cy={cy} r="9" fill="white" />
            <circle cx={cx} cy={cy} r="6" fill="var(--color-accent-500)" />
          </g>
        </>
      ) : (
        <circle cx={mid} cy={mid} r="4" fill="var(--color-navy-300)" />
      )}

      {/* Axis pole labels */}
      <text x={pad + 2} y={mid - 7} fontSize="10.5" fontWeight="700" fill="var(--color-muted)">
        {POSITIONING_AXES.economic.negative}
      </text>
      <text
        x={S - pad - 2}
        y={mid - 7}
        fontSize="10.5"
        fontWeight="700"
        fill="var(--color-muted)"
        textAnchor="end"
      >
        {POSITIONING_AXES.economic.positive}
      </text>
      <text x={mid + 7} y={pad + 14} fontSize="10.5" fontWeight="700" fill="var(--color-muted)">
        {POSITIONING_AXES.social.positive}
      </text>
      <text x={mid + 7} y={S - pad - 6} fontSize="10.5" fontWeight="700" fill="var(--color-muted)">
        {POSITIONING_AXES.social.negative}
      </text>

      {basis === 0 ? (
        <text x={mid} y={mid + 22} fontSize="10.5" fill="var(--color-muted)" textAnchor="middle">
          Sem dados suficientes
        </text>
      ) : null}
    </svg>
  );
}
