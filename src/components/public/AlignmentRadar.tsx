"use client";

/**
 * AlignmentRadar — the Votto mark as a living chart.
 *
 * An organic radar: the six vertices are joined by a closed Catmull-Rom curve
 * (converted to cubic béziers) with a small jitter on the control points, so the
 * outline reads as a hand-drawn petal instead of a spider web. The dark organic
 * mass behind it is the same construction at a larger radius with nine vertices.
 * The geometry itself lives in `@/lib/viz/figure`, shared with the still
 * positioning figure so the two cannot drift apart.
 *
 * The illustration cycles through four datasets and the three closed colourways
 * (escuro → claro → terracota), tweening ground, hairlines, both petals and the
 * vertex dots together. Each vertex is delayed 50ms after the previous one, so a
 * transition reaccommodates in a wave rather than inflating as a block; on top of
 * that a permanent ±1.2% breath keeps it from ever being fully static.
 *
 * Labels sit on the paper, outside the mass, and never move.
 *
 * No dependencies. Honours `prefers-reduced-motion` by rendering a single frame.
 */
import { useEffect, useRef } from "react";
import {
  blobPath,
  vertexAngle,
  vertexPoint,
  GROUND_VALUES,
  INK_FIGURE,
  type Field,
} from "@/lib/viz/figure";

const C = 250;
const R = 147;
const N = 6;
const FIELD: Field = { cx: C, cy: C, radius: R };

const LABELS = ["Sustentabilidade", "Saúde", "Educação", "Economia", "Segurança", "Direitos"];

/** The three closed colourways, verbatim from the colour study. */
const PALETTES = [
  {
    ground: INK_FIGURE.ground,
    you: INK_FIGURE.light,
    youFill: 0.13,
    ag: INK_FIGURE.pigment,
    agFill: 0.17,
    hair: INK_FIGURE.hair,
    hairOp: INK_FIGURE.hairOpacity,
  },
  { ground: "#efe7d6", you: "#1f4a41", youFill: 0.10, ag: "#b4552f", agFill: 0.13, hair: "#211f1b", hairOp: 0.16 },
  { ground: "#a8452f", you: "#f7ece0", youFill: 0.16, ag: "#2e2a22", agFill: 0.20, hair: "#f7ece0", hairOp: 0.22 },
];

/** Plausible profiles; replace with real per-area alignment once it is computed. */
const DATA = [
  { you: [0.90, 0.66, 0.94, 0.58, 0.74, 0.88], ag: [0.62, 0.90, 0.68, 0.84, 0.50, 0.62] },
  { you: [0.72, 0.88, 0.60, 0.84, 0.66, 0.78], ag: [0.86, 0.54, 0.90, 0.62, 0.74, 0.58] },
  { you: [0.84, 0.74, 0.80, 0.70, 0.90, 0.62], ag: [0.58, 0.82, 0.66, 0.88, 0.56, 0.86] },
  { you: [0.66, 0.92, 0.72, 0.86, 0.60, 0.80], ag: [0.90, 0.62, 0.84, 0.58, 0.88, 0.66] },
];

const HOLD = 2600;
const TWEEN = 2000;
const STEP = HOLD + TWEEN;

const blob = (values: number[], jitter: number) => blobPath(values, FIELD, jitter);
const point = (i: number, v: number, n: number) => vertexPoint(FIELD, i, v, n);

const GROUND_D = blob(GROUND_VALUES, 4);
const RING_D = blob([0.6, 0.6, 0.6, 0.6, 0.6, 0.6], 5);
const AXES = Array.from({ length: N }, (_, i) => point(i, 1.04, N));

const hex = (h: string) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const mixHex = (a: number[], b: number[], t: number) =>
  `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(",")})`;
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export function AlignmentRadar({ className }: { className?: string }) {
  const ground = useRef<SVGPathElement>(null);
  const hairs = useRef<(SVGElement | null)[]>([]);
  const youPath = useRef<SVGPathElement>(null);
  const agPath = useRef<SVGPathElement>(null);
  const dots = useRef<(SVGCircleElement | null)[]>([]);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;

    const draw = (now: number) => {
      const cycle = Math.floor(now / STEP);
      const phase = now % STEP;
      const raw = phase < HOLD ? 0 : (phase - HOLD) / TWEEN;
      const t = ease(raw);

      const a = DATA[cycle % DATA.length];
      const b = DATA[(cycle + 1) % DATA.length];
      const pa = PALETTES[cycle % PALETTES.length];
      const pb = PALETTES[(cycle + 1) % PALETTES.length];

      const breath = (i: number) => 1 + Math.sin(now / 1600 + i * 1.7) * 0.012;
      const stagger = (from: number[], to: number[]) =>
        from.map((v, i) => {
          const local = ease(Math.max(0, Math.min(1, (raw - i * 0.05) / (1 - 0.05 * (N - 1)))));
          return (v + (to[i] - v) * local) * breath(i);
        });

      const you = stagger(a.you, b.you);
      const ag = stagger(a.ag, b.ag);

      const cYou = mixHex(hex(pa.you), hex(pb.you), t);
      const cAg = mixHex(hex(pa.ag), hex(pb.ag), t);
      const cGround = mixHex(hex(pa.ground), hex(pb.ground), t);
      const cHair = mixHex(hex(pa.hair), hex(pb.hair), t);
      const oHair = String(pa.hairOp + (pb.hairOp - pa.hairOp) * t);

      ground.current?.setAttribute("fill", cGround);
      hairs.current.forEach((el) => {
        el?.setAttribute("stroke", cHair);
        el?.setAttribute("opacity", oHair);
      });

      youPath.current?.setAttribute("d", blob(you, 4));
      youPath.current?.setAttribute("stroke", cYou);
      youPath.current?.setAttribute("fill", cYou);
      youPath.current?.setAttribute("fill-opacity", String(pa.youFill + (pb.youFill - pa.youFill) * t));

      agPath.current?.setAttribute("d", blob(ag, 4));
      agPath.current?.setAttribute("stroke", cAg);
      agPath.current?.setAttribute("fill", cAg);
      agPath.current?.setAttribute("fill-opacity", String(pa.agFill + (pb.agFill - pa.agFill) * t));

      dots.current.forEach((el, i) => {
        const [x, y] = point(i, you[i], N);
        el?.setAttribute("cx", x.toFixed(1));
        el?.setAttribute("cy", y.toFixed(1));
        el?.setAttribute("fill", cYou);
      });

      if (!reduce) raf = requestAnimationFrame(draw);
    };

    draw(0);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <svg viewBox="0 0 500 500" className={className} role="img" aria-label="Alinhamento por área: seu perfil de votos comparado ao de um representante">
      <path ref={ground} d={GROUND_D} fill={PALETTES[0].ground} />
      {AXES.map(([x, y], i) => (
        <line
          key={i}
          ref={(el) => {
            hairs.current[i] = el;
          }}
          x1={C}
          y1={C}
          x2={x.toFixed(1)}
          y2={y.toFixed(1)}
          stroke={PALETTES[0].hair}
          strokeWidth={1}
          opacity={PALETTES[0].hairOp}
        />
      ))}
      <path
        ref={(el) => {
          hairs.current[N] = el;
        }}
        d={RING_D}
        fill="none"
        stroke={PALETTES[0].hair}
        strokeWidth={1}
        opacity={PALETTES[0].hairOp}
      />
      <path ref={agPath} fill={PALETTES[0].ag} fillOpacity={PALETTES[0].agFill} stroke={PALETTES[0].ag} strokeWidth={2.5} strokeLinejoin="round" />
      <path ref={youPath} fill={PALETTES[0].you} fillOpacity={PALETTES[0].youFill} stroke={PALETTES[0].you} strokeWidth={2.7} strokeLinejoin="round" />
      {LABELS.map((_, i) => (
        <circle
          key={i}
          ref={(el) => {
            dots.current[i] = el;
          }}
          r={4}
          fill={PALETTES[0].you}
        />
      ))}
      {LABELS.map((label, i) => {
        const mid = Math.abs(Math.cos(vertexAngle(i, N))) < 0.2;
        const [x, y] = point(i, mid ? 1.5 : 1.58, N);
        return (
          <text
            key={label}
            x={x.toFixed(0)}
            y={(y + (mid ? (y < C ? -8 : 16) : 4)).toFixed(0)}
            textAnchor="middle"
            fontSize={11}
            fontWeight={400}
            letterSpacing={0.2}
            fill="var(--color-muted)"
            style={{ fontFamily: "var(--font-sans)" }}
          >
            {label}
          </text>
        );
      })}
    </svg>
  );
}
