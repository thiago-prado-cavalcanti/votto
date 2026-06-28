/**
 * Simple two-axis positioning chart (SVG). Plots a single point on the
 * Estado↔Mercado (x) and Comunidade↔Indivíduo (y) axes, normalized −100..100.
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
  const size = 280;
  const pad = 28;
  const span = size - pad * 2;
  // x: economic (−100 left → +100 right); y: social (+100 top → −100 bottom)
  const cx = pad + ((economic + 100) / 200) * span;
  const cy = pad + ((100 - social) / 200) * span;
  const mid = size / 2;

  return (
    <div className="w-full">
      <svg
        viewBox={`0 0 ${size} ${size}`}
        className="mx-auto w-full max-w-[320px]"
        role="img"
        aria-label="Gráfico de posicionamento em dois eixos"
      >
        {/* Quadrants background */}
        <rect x={pad} y={pad} width={span} height={span} fill="var(--color-canvas)" rx="8" />
        {/* Axes */}
        <line x1={mid} y1={pad} x2={mid} y2={size - pad} stroke="var(--color-line)" strokeWidth="1" />
        <line x1={pad} y1={mid} x2={size - pad} y2={mid} stroke="var(--color-line)" strokeWidth="1" />

        {/* Point */}
        {basis > 0 ? (
          <>
            <circle cx={cx} cy={cy} r="8" fill="var(--color-navy-600)" />
            <circle cx={cx} cy={cy} r="14" fill="var(--color-navy-600)" opacity="0.18" />
          </>
        ) : null}

        {/* Axis pole labels */}
        <text x={pad - 4} y={mid - 4} fontSize="10" fill="var(--color-muted)" textAnchor="start">
          {POSITIONING_AXES.economic.negative}
        </text>
        <text
          x={size - pad + 4}
          y={mid - 4}
          fontSize="10"
          fill="var(--color-muted)"
          textAnchor="end"
        >
          {POSITIONING_AXES.economic.positive}
        </text>
        <text x={mid + 4} y={pad + 2} fontSize="10" fill="var(--color-muted)" textAnchor="start">
          {POSITIONING_AXES.social.positive}
        </text>
        <text
          x={mid + 4}
          y={size - pad + 2}
          fontSize="10"
          fill="var(--color-muted)"
          textAnchor="start"
        >
          {POSITIONING_AXES.social.negative}
        </text>
      </svg>
      {basis === 0 ? (
        <p className="mt-2 text-center text-xs text-[var(--color-muted)]">
          Sem dados de votação suficientes para posicionar.
        </p>
      ) : null}
    </div>
  );
}
