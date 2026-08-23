/**
 * Positioning figure — where a person, an agent or a party sits on the two value
 * axes, Estado↔Mercado (x) and Comunidade↔Indivíduo (y).
 *
 * Drawn as the brand's own organic figure rather than as a scatter plot: the
 * same dark mass, hairlines and hand-drawn petal as the hero's `AlignmentRadar`
 * (geometry shared in `@/lib/viz/figure`), in the study's "escuro" colourway. A
 * still chart does not cycle palettes, so it holds the hero's opening frame.
 *
 * What the drawing says:
 *
 * - the **petal leans** toward the quadrant the votes point at, and stretches
 *   with how far from the centre they are — a centrist reads as a near-circle;
 * - the **pigment dot** is the exact position, on an ink vector from the centre,
 *   so the shape can be read at a glance and the point read precisely;
 * - a position past the rim on the diagonal is pulled back to it (the axes are
 *   each −100..100, so their corner is 141 units away), which only ever moves
 *   the dot, never the direction it points.
 *
 * Inside a revealed block the mass fades up, the vector draws itself out from
 * the centre and the dot lands on its tip; outside one it renders finished.
 *
 * Server-component friendly (no client hooks).
 */
import type { CSSProperties } from "react";
import { POSITIONING_AXES } from "@/lib/indexes/positioning";
import {
  blobPath,
  vertexAngle,
  vertexPoint,
  GROUND_VALUES,
  INK_FIGURE,
  type Field,
} from "@/lib/viz/figure";

// Wider than tall: the pole labels sit on the paper beside the mass, and
// "Comunidade" needs more room to the side than the figure needs above it.
const W = 340;
const H = 300;
const FIELD: Field = { cx: W / 2, cy: H / 2, radius: 82 };
/** The hero's hand at this radius (it uses 4 at r=147). */
const JITTER = FIELD.radius / 37;

/**
 * Vertices of the petal. Twelve: enough for the lean to read as a curve rather
 * than a corner, and a multiple of four, so a vertex — and its dot — lands on
 * each of the four poles.
 */
const LOBES = 12;
/** Radius of a centrist figure, and how far the lean pulls it in and out. */
const BASE = 0.78;
const PULL = 0.16;
const REACH = 0.36;
/** Where the exact position sits, as a fraction of the field radius. Short of
 *  the petal's reach, so the dot always lands inside the shape it explains. */
const POINT_REACH = 0.78;

const GROUND_D = blobPath(GROUND_VALUES, FIELD, JITTER);
/** Two drawn rings, as hairlines — the grid of a plotted chart, by hand. */
const RINGS = [0.42, 0.78].map((r) => blobPath(Array<number>(6).fill(r), FIELD, JITTER * 1.2));
/** Eight spokes, four of them the poles the labels name. */
const SPOKES = Array.from({ length: 8 }, (_, i) => vertexPoint(FIELD, i, 1.06, 8));

const clamp = (n: number) => Math.max(-1, Math.min(1, n / 100));

export function PositioningChart({
  economic,
  social,
}: {
  /** −100..100, ou `null` quando a cobertura não alcançou o piso. */
  economic: number | null;
  social: number | null;
}) {
  // Os dois eixos, ou nenhum. Desenhar a figura com um eixo faltando obrigaria
  // a tratá-lo como zero, que é a coordenada do centro — e afirmar centro por
  // falta de medida é exatamente o erro que o índice foi reconstruído para não
  // cometer (CLAUDE.md §3.2).
  const hasReading = economic !== null && social !== null;

  // Axis units, then pulled back inside the rim if the corner overshoots it.
  const ex = clamp(economic ?? 0);
  const sy = clamp(social ?? 0);
  const len = Math.hypot(ex, sy);
  const k = len > 1 ? 1 / len : 1;
  const x = ex * k;
  const y = sy * k;
  const magnitude = hasReading ? Math.hypot(x, y) : 0;
  // Screen-space direction of the reading (SVG's y grows downward).
  const phi = Math.atan2(-y, x);

  const petal = Array.from({ length: LOBES }, (_, i) => {
    if (magnitude === 0) return BASE;
    const lean = ((Math.cos(vertexAngle(i, LOBES) - phi) + 1) / 2) ** 1.4;
    return BASE - PULL * magnitude + REACH * magnitude * lean;
  });

  const px = FIELD.cx + FIELD.radius * POINT_REACH * x;
  const py = FIELD.cy - FIELD.radius * POINT_REACH * y;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="mx-auto block w-full max-w-[320px]"
      role="img"
      aria-label={
        hasReading
          ? `Posicionamento em dois eixos: ${economic} no eixo ${POSITIONING_AXES.economic.negative}–${POSITIONING_AXES.economic.positive}, ${social} no eixo ${POSITIONING_AXES.social.negative}–${POSITIONING_AXES.social.positive}`
          : "Gráfico de posicionamento em dois eixos, sem dados suficientes"
      }
    >
      {/* The mass the figure is printed on. */}
      <path d={GROUND_D} fill={INK_FIGURE.ground} />

      {/* Hairlines: the spokes and the rings, drawn rather than plotted. */}
      <g stroke={INK_FIGURE.hair} opacity={INK_FIGURE.hairOpacity} fill="none" strokeWidth={1}>
        {SPOKES.map(([spx, spy], i) => (
          <line key={i} x1={FIELD.cx} y1={FIELD.cy} x2={spx.toFixed(1)} y2={spy.toFixed(1)} />
        ))}
        {RINGS.map((d, i) => (
          <path key={i} d={d} />
        ))}
      </g>

      {/* The reading, as a petal that leans, with a dot on each pole. */}
      <g className="vt-fade" style={{ "--vt-d": "180ms" } as CSSProperties}>
        <path
          d={blobPath(petal, FIELD, JITTER)}
          fill={INK_FIGURE.light}
          fillOpacity={hasReading ? 0.18 : 0.07}
          stroke={INK_FIGURE.light}
          strokeOpacity={hasReading ? 1 : 0.35}
          strokeWidth={2.6}
          strokeLinejoin="round"
        />
        {hasReading
          ? [0, 3, 6, 9].map((i) => {
              const [dx, dy] = vertexPoint(FIELD, i, petal[i], LOBES);
              return <circle key={i} cx={dx.toFixed(1)} cy={dy.toFixed(1)} r={2.6} fill={INK_FIGURE.light} />;
            })
          : null}
      </g>

      {/* The exact position: a vector out of the centre, a pigment dot on its tip. */}
      {hasReading ? (
        <>
          <line
            className="vt-draw"
            style={{ "--vt-d": "420ms" } as CSSProperties}
            pathLength={1}
            x1={FIELD.cx}
            y1={FIELD.cy}
            x2={px.toFixed(1)}
            y2={py.toFixed(1)}
            stroke={INK_FIGURE.light}
            strokeOpacity={0.7}
            strokeWidth={1.5}
            strokeLinecap="round"
          />
          <circle
            className="vt-pop"
            style={{ "--vt-d": "760ms" } as CSSProperties}
            cx={px.toFixed(1)}
            cy={py.toFixed(1)}
            r={6}
            fill={INK_FIGURE.pigment}
            stroke={INK_FIGURE.light}
            strokeWidth={1.5}
          />
        </>
      ) : (
        <circle cx={FIELD.cx} cy={FIELD.cy} r={3} fill={INK_FIGURE.light} fillOpacity={0.4} />
      )}

      {/* Pole labels, on the paper outside the mass, as everywhere else in the system. */}
      <g
        fontSize="9.5"
        fontWeight="600"
        fill="var(--color-muted)"
        letterSpacing="1"
        style={{ fontFamily: "var(--font-sans)", textTransform: "uppercase" }}
      >
        <text x={FIELD.cx} y={14} textAnchor="middle">
          {POSITIONING_AXES.social.positive}
        </text>
        <text x={FIELD.cx} y={H - 6} textAnchor="middle">
          {POSITIONING_AXES.social.negative}
        </text>
        <text x={4} y={FIELD.cy + 3.5}>
          {POSITIONING_AXES.economic.negative}
        </text>
        <text x={W - 4} y={FIELD.cy + 3.5} textAnchor="end">
          {POSITIONING_AXES.economic.positive}
        </text>
      </g>

      {/* Inside the mass, in the band between the neutral petal and the rim —
          on the paper it would crowd the pole label under it. */}
      {!hasReading ? (
        <text
          x={FIELD.cx}
          y={FIELD.cy + FIELD.radius * 0.95}
          textAnchor="middle"
          fontSize="10.5"
          fill={INK_FIGURE.light}
          fillOpacity={0.5}
          style={{ fontFamily: "var(--font-sans)" }}
        >
          Sem dados suficientes
        </text>
      ) : null}
    </svg>
  );
}
