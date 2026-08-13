/**
 * Left↔right spectrum scale (SVG), printed rather than lit.
 *
 * The five bands are five blocks of pigment: the person's own band is inked
 * solid, the other four stay as tinted paper, so the reading is legible before
 * the marker is even found. The marker itself is a 2px ink rule with the band
 * name set above it in the display serif — no gradient, no glow, no bubble
 * (docs/design.md).
 *
 * Inside a revealed block the five bands wipe in, the marker rule then draws
 * itself down through the track and the band name arrives last — the reading
 * assembles in the order it is meant to be read. Outside one it renders finished.
 *
 * Server-component friendly (no client hooks).
 *
 * NOT CURRENTLY MOUNTED. The left↔right band it draws is computed from theme
 * axis tags that are not filled in yet (CLAUDE.md §11), so it was placing PL at
 * the centre — a wrong verdict stated with confidence. Kept, unrendered, until
 * the tagging exists; the two-axis figure (`PositioningChart`) stays live
 * because it shows a shape rather than a sentence.
 */
import type { CSSProperties } from "react";
import { deriveBand } from "@/lib/indexes/positioning";

/** Pigment per band, left to right: tijolo · ocre · pedra · pinho · tinta. */
const BAND_COLOR: Record<string, string> = {
  esquerda: "var(--color-negative)",
  "centro-esquerda": "var(--color-ochre)",
  centro: "var(--color-vote-abstention)",
  "centro-direita": "var(--color-colonial-500)",
  direita: "var(--color-navy-900)",
};

/** Band boundaries on the −100..100 scale, in reading order. */
const BANDS = [
  { key: "esquerda", from: -100, to: -50 },
  { key: "centro-esquerda", from: -50, to: -15 },
  { key: "centro", from: -15, to: 15 },
  { key: "centro-direita", from: 15, to: 50 },
  { key: "direita", from: 50, to: 100 },
];

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
  const H = 82;
  const pad = 4;
  const trackY = 44;
  const trackH = 12;
  const span = W - pad * 2;

  const clamped = Math.max(-100, Math.min(100, spectrum));
  const at = (s: number) => pad + ((s + 100) / 200) * span;
  const x = at(clamped);

  const band = deriveBand(clamped);
  const color = BAND_COLOR[band.key] ?? "var(--color-vote-abstention)";

  // Keep the label inside the viewBox at both extremes.
  const labelX = Math.max(pad + 34, Math.min(W - pad - 34, x));

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full"
      role="img"
      aria-label={`Posicionamento: ${band.label}`}
    >
      {/* The five bands: the person's own is inked, the rest are tinted paper.
          Wiped in as one group so the joins never open mid-flight. */}
      <g className="vt-grow">
        {BANDS.map((b) => {
          const active = b.key === band.key;
          return (
            <rect
              key={b.key}
              x={at(b.from)}
              y={trackY}
              width={at(b.to) - at(b.from)}
              height={trackH}
              fill={BAND_COLOR[b.key]}
              fillOpacity={active ? 1 : 0.16}
            />
          );
        })}
        {/* Hairline between bands, in paper so it reads as a fold. */}
        {BANDS.slice(1).map((b) => (
          <line
            key={b.key}
            x1={at(b.from)}
            y1={trackY}
            x2={at(b.from)}
            y2={trackY + trackH}
            stroke="var(--color-canvas)"
            strokeWidth="1"
          />
        ))}
      </g>

      {/* Marker: an ink rule through the track. */}
      <line
        className="vt-draw"
        style={{ "--vt-d": "520ms" } as CSSProperties}
        pathLength={1}
        x1={x}
        y1={trackY - 7}
        x2={x}
        y2={trackY + trackH + 7}
        stroke="var(--color-navy-900)"
        strokeWidth="2"
      />

      {/* Band name, in the display serif. */}
      <text
        className="vt-fade"
        style={{ fontFamily: "var(--font-display)", "--vt-d": "820ms" } as CSSProperties}
        x={labelX}
        y={26}
        textAnchor="middle"
        fontSize="14"
        fontWeight="500"
        fill={color}
      >
        {band.label}
      </text>

      {/* Endpoint labels */}
      <g
        fontSize="9.5"
        fontWeight="600"
        fill="var(--color-muted)"
        letterSpacing="1"
        style={{ fontFamily: "var(--font-sans)", textTransform: "uppercase" }}
      >
        <text x={pad} y={H - 8}>
          ESQUERDA
        </text>
        <text x={W / 2} y={H - 8} textAnchor="middle">
          CENTRO
        </text>
        <text x={W - pad} y={H - 8} textAnchor="end">
          DIREITA
        </text>
      </g>
    </svg>
  );
}
