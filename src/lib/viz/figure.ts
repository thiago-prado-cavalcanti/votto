/**
 * The organic figure — the one curve Votto draws its index charts with.
 *
 * The hero's living mark (`AlignmentRadar`) and the still positioning figure
 * (`PositioningChart`) are the same construction: N vertices at polar radii,
 * joined by a closed Catmull-Rom curve converted to cubic béziers, with a small
 * deterministic jitter on the control points so the outline reads as drawn by
 * hand instead of plotted. It lives here so the still figure cannot drift away
 * from the animated one — they are meant to be recognisably the same mark.
 *
 * Everything is deterministic (no `Math.random`), so a server-rendered path and
 * the client's are identical and React never reconciles a mismatch.
 */

export type Point = [number, number];

/** Where a figure sits and how big a value of 1 is, in viewBox units. */
export interface Field {
  cx: number;
  cy: number;
  radius: number;
}

/** Angle of vertex `i` of `n`, starting at twelve o'clock and running clockwise. */
export function vertexAngle(i: number, n: number) {
  return ((-90 + (i * 360) / n) * Math.PI) / 180;
}

/** Vertex `i` of `n` at `value` (a fraction of the field radius). */
export function vertexPoint(field: Field, i: number, value: number, n: number): Point {
  return [
    field.cx + field.radius * value * Math.cos(vertexAngle(i, n)),
    field.cy + field.radius * value * Math.sin(vertexAngle(i, n)),
  ];
}

/** Deterministic pseudo-random, so "the hand" is the same on every render. */
const wobble = (k: number) => (Math.sin(k * 12.9898) * 43758.5453) % 1;

/**
 * Closed blob through `values`, each a fraction of the field radius.
 *
 * `jitter` is in viewBox units and should scale with the figure, so a small
 * chart is not shakier than a large one — `field.radius / 37` reproduces the
 * hero's hand at any size.
 */
export function blobPath(values: number[], field: Field, jitter: number): string {
  const n = values.length;
  return blobThrough(
    values.map((v, i) => vertexPoint(field, i, v, n)),
    jitter,
  );
}

/**
 * A mesma curva, por pontos explícitos em vez de valores igualmente espaçados.
 *
 * Existe porque uma leitura pode ter **buracos**: no radar por área, um eixo sem
 * base suficiente é `null`, e desenhá-lo em zero afirmaria concordância zero —
 * que é uma leitura, não uma ausência. A pétala então passa só pelos vértices
 * que existem, nos ângulos verdadeiros deles, e os eixos sem leitura ficam
 * marcados no lugar sem participar da forma.
 *
 * `blobPath` é o caso particular em que todos os vértices existem.
 */
export function blobThrough(P: Point[], jitter: number): string {
  const n = P.length;
  if (n < 3) return "";
  let d = `M${P[0][0].toFixed(1)} ${P[0][1].toFixed(1)}`;
  for (let i = 0; i < n; i++) {
    const p0 = P[(i - 1 + n) % n];
    const p1 = P[i];
    const p2 = P[(i + 1) % n];
    const p3 = P[(i + 2) % n];
    const c1 = [
      p1[0] + (p2[0] - p0[0]) / 5.4 + wobble(i + 1) * jitter,
      p1[1] + (p2[1] - p0[1]) / 5.4 + wobble(i + 2) * jitter,
    ];
    const c2 = [
      p2[0] - (p3[0] - p1[0]) / 5.4 + wobble(i + 3) * jitter,
      p2[1] - (p3[1] - p1[1]) / 5.4 + wobble(i + 4) * jitter,
    ];
    d += ` C${c1[0].toFixed(1)} ${c1[1].toFixed(1)}, ${c2[0].toFixed(1)} ${c2[1].toFixed(1)}, ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  return `${d} Z`;
}

/** The nine-vertex mass the figure sits on — the hero's ground, verbatim. */
export const GROUND_VALUES = [1.24, 1.19, 1.26, 1.2, 1.23, 1.18, 1.27, 1.2, 1.22];

/**
 * The "escuro" colourway of the brand study: the hero's opening frame, and the
 * only one a still figure uses (a printed chart does not cycle palettes).
 */
export const INK_FIGURE = {
  ground: "#1c1a16",
  /** Paper, for the subject's own outline on the dark mass. */
  light: "#efe9dc",
  /** Pigment, for the reading itself. */
  pigment: "#d98b3f",
  hair: "#efe9dc",
  hairOpacity: 0.16,
} as const;
