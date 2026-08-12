/**
 * Two-axis positioning chart (SVG).
 *
 * Plots a single point on the Estado↔Mercado (x) and Comunidade↔Indivíduo (y)
 * axes (−100..100). Drawn as a printed plot: squared plate with a 1px rule,
 * quadrants barely tinted, hairline rings, and the position marked by an ink
 * vector ending in a terracota dot ringed in paper — no glow, no drop shadow
 * (docs/design.md).
 *
 * Server-component friendly (no client hooks).
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
        <clipPath id="vt-plot">
          <rect x={pad} y={pad} width={span} height={span} />
        </clipPath>
      </defs>

      {/* Plot surface */}
      <rect
        x={pad}
        y={pad}
        width={span}
        height={span}
        fill="var(--color-surface)"
        stroke="var(--color-line)"
      />

      {/* Quadrant tints — just enough to orient, never enough to decorate. */}
      <g clipPath="url(#vt-plot)" opacity="0.07">
        <rect x={mid} y={pad} width={span / 2} height={span / 2} fill="var(--color-accent-500)" />
        <rect x={pad} y={pad} width={span / 2} height={span / 2} fill="var(--color-colonial-500)" />
        <rect x={pad} y={mid} width={span / 2} height={span / 2} fill="var(--color-navy-700)" />
        <rect x={mid} y={mid} width={span / 2} height={span / 2} fill="var(--color-ochre)" />
      </g>

      {/* Concentric rings */}
      <g clipPath="url(#vt-plot)" stroke="var(--color-line)" fill="none">
        <circle cx={mid} cy={mid} r={span / 6} />
        <circle cx={mid} cy={mid} r={span / 3} />
        <circle cx={mid} cy={mid} r={span / 2.25} />
      </g>

      {/* Axes */}
      <line x1={mid} y1={pad} x2={mid} y2={S - pad} stroke="var(--color-navy-300)" strokeWidth="1" />
      <line x1={pad} y1={mid} x2={S - pad} y2={mid} stroke="var(--color-navy-300)" strokeWidth="1" />

      {/* Vector + point */}
      {basis > 0 ? (
        <>
          <line
            x1={mid}
            y1={mid}
            x2={cx}
            y2={cy}
            stroke="var(--color-navy-700)"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
          <circle
            cx={cx}
            cy={cy}
            r="6"
            fill="var(--color-accent-500)"
            stroke="var(--color-surface)"
            strokeWidth="2"
          />
        </>
      ) : (
        <circle cx={mid} cy={mid} r="3.5" fill="var(--color-navy-300)" />
      )}

      {/* Axis pole labels */}
      <g
        fontSize="9.5"
        fontWeight="600"
        fill="var(--color-muted)"
        letterSpacing="0.8"
        style={{ fontFamily: "var(--font-sans)" }}
      >
        <text x={pad + 2} y={mid - 8}>
          {POSITIONING_AXES.economic.negative}
        </text>
        <text x={S - pad - 2} y={mid - 8} textAnchor="end">
          {POSITIONING_AXES.economic.positive}
        </text>
        <text x={mid + 8} y={pad + 14}>
          {POSITIONING_AXES.social.positive}
        </text>
        <text x={mid + 8} y={S - pad - 6}>
          {POSITIONING_AXES.social.negative}
        </text>
      </g>

      {basis === 0 ? (
        <text x={mid} y={mid + 22} fontSize="10.5" fill="var(--color-muted)" textAnchor="middle">
          Sem dados suficientes
        </text>
      ) : null}
    </svg>
  );
}
