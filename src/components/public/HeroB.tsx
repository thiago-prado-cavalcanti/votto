"use client";

import { ButtonLink } from "@/components/ui";
import { cn } from "@/lib/cn";

/**
 * HeroB — "Concept B" public hero for Votto.
 *
 * Distinctive direction vs. a centered hero: an asymmetric editorial split.
 * Left column carries the message (eyebrow, headline, subtitle, CTAs, steps);
 * the right column hosts a data-driven "alignment gauge" motif — agents plotted
 * along a Não → Sim spectrum against the citizen's position, with a live needle.
 *
 * All entrance animation is scoped to a local <style> block with `heroB-`
 * prefixed keyframes and respects `prefers-reduced-motion`.
 */

type AgentDot = {
  /** Horizontal position on the spectrum, 0 (Não) → 100 (Sim). */
  x: number;
  /** Vertical lane, just for visual spread (0–100). */
  y: number;
  /** Alignment score with the citizen, drives size + glow. */
  score: number;
  label: string;
  delay: number;
};

const AGENTS: AgentDot[] = [
  { x: 86, y: 26, score: 94, label: "A. Ribeiro", delay: 0.05 },
  { x: 72, y: 58, score: 81, label: "Partido Verde", delay: 0.12 },
  { x: 63, y: 38, score: 67, label: "M. Tavares", delay: 0.19 },
  { x: 47, y: 72, score: 52, label: "Bloco Central", delay: 0.26 },
  { x: 34, y: 30, score: 38, label: "C. Nunes", delay: 0.33 },
  { x: 18, y: 60, score: 21, label: "Partido Azul", delay: 0.4 },
];

const STEPS = [
  {
    n: "1",
    title: "Vote nos temas",
    body: "Manifeste-se em projetos de lei e pautas reais com um Sim, Não ou Neutro.",
  },
  {
    n: "2",
    title: "Medimos o alinhamento",
    body: "Comparamos seus votos com os dos agentes públicos e partidos.",
  },
  {
    n: "3",
    title: "Decida melhor",
    body: "Descubra quem realmente representa as suas posições.",
  },
];

export function HeroB() {
  return (
    <section className="relative isolate overflow-hidden bg-navy-900 text-white">
      <HeroBStyles />

      {/* Ambient background: teal/orange aurora + fine grid */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -left-40 -top-40 h-[36rem] w-[36rem] rounded-full bg-colonial-500/25 blur-[120px]" />
        <div className="absolute -right-32 top-1/3 h-[32rem] w-[32rem] rounded-full bg-accent-500/20 blur-[120px]" />
        <div
          className="absolute inset-0 opacity-[0.4]"
          style={{
            backgroundImage:
              "linear-gradient(to right, rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.04) 1px, transparent 1px)",
            backgroundSize: "56px 56px",
            maskImage:
              "radial-gradient(120% 90% at 30% 10%, black 35%, transparent 80%)",
            WebkitMaskImage:
              "radial-gradient(120% 90% at 30% 10%, black 35%, transparent 80%)",
          }}
        />
      </div>

      <div className="relative mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-24 lg:py-28">
        <div className="grid items-center gap-14 lg:grid-cols-[1.05fr_0.95fr] lg:gap-12">
          {/* ── Left: editorial column ─────────────────────────────── */}
          <div className="max-w-xl">
            <p
              className="heroB-anim heroB-step-0 flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.28em] text-accent-500"
              style={{ animationDelay: "0.05s" }}
            >
              <span className="h-px w-8 bg-accent-500/70" />
              Democracia direta
            </p>

            <h1
              className="heroB-anim heroB-step-1 mt-6 font-display text-[2.85rem] font-extrabold leading-[0.98] tracking-tight sm:text-6xl lg:text-[4.1rem]"
              style={{ animationDelay: "0.13s" }}
            >
              {/* Three explicit lines. Each segment is a block, so the break
                  never depends on the viewport width — and the highlighted word
                  stays `inline-block` inside its own block wrapper so the
                  underline sizes to the word, not to the headline column. */}
              <span className="block">Sua voz</span>
              <span className="block">
                <span className="relative inline-block text-accent-500">
                  transformando
                  <svg
                    aria-hidden
                    viewBox="0 0 200 12"
                    preserveAspectRatio="none"
                    className="heroB-underline absolute -bottom-1 left-0 h-2.5 w-full text-accent-500"
                  >
                    <path
                      d="M2 8 C 50 2, 150 2, 198 7"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3"
                      strokeLinecap="round"
                    />
                  </svg>
                </span>
              </span>
              <span className="block">a democracia.</span>
            </h1>

            <p
              className="heroB-anim heroB-step-2 mt-7 max-w-lg text-base leading-relaxed text-navy-200 sm:text-lg"
              style={{ animationDelay: "0.21s" }}
            >
              O Votto é um complemento à democracia representativa: os cidadãos
              votam diretamente nos temas que importam, e a plataforma mede o
              quanto cada agente público e partido está alinhado com seus
              eleitores e com você.
            </p>

            <div
              className="heroB-anim heroB-step-3 mt-9 flex flex-col gap-3 sm:flex-row sm:items-center"
              style={{ animationDelay: "0.29s" }}
            >
              <ButtonLink href="/temas" size="lg">
                Votar nos temas
              </ButtonLink>
              <ButtonLink href="/agentes" variant="inverse" size="lg">
                Ver agentes
              </ButtonLink>
            </div>
          </div>

          {/* ── Right: alignment gauge motif ───────────────────────── */}
          <AlignmentMotif />
        </div>

        {/* ── Steps strip ──────────────────────────────────────────── */}
        <ol className="mt-16 grid gap-px overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04] sm:mt-20 sm:grid-cols-3">
          {STEPS.map((s, i) => (
            <li
              key={s.n}
              className="heroB-anim heroB-step-up group relative bg-navy-900/40 p-6 sm:p-7"
              style={{ animationDelay: `${0.5 + i * 0.12}s` }}
            >
              <div className="flex items-baseline gap-3">
                <span className="font-display text-3xl font-extrabold leading-none text-accent-500">
                  {s.n}
                </span>
                <span className="mt-0.5 h-px flex-1 bg-gradient-to-r from-accent-500/40 to-transparent" />
              </div>
              <h3 className="mt-4 font-display text-lg font-bold text-white">
                {s.title}
              </h3>
              <p className="mt-1.5 text-sm leading-relaxed text-navy-300">
                {s.body}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/* ─── Alignment gauge motif ──────────────────────────────────────────── */

function AlignmentMotif() {
  return (
    <div
      className="heroB-anim heroB-motif relative mx-auto w-full max-w-md"
      style={{ animationDelay: "0.34s" }}
    >
      <div className="relative overflow-hidden rounded-[28px] border border-white/12 bg-navy-800/70 p-6 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.8)] backdrop-blur-sm sm:p-7">
        {/* header */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[0.7rem] font-semibold uppercase tracking-[0.2em] text-navy-300">
              Alinhamento com você
            </p>
            <p className="mt-1 font-display text-sm font-bold text-white">
              Espectro de votos · 124 temas
            </p>
          </div>
          <span className="flex h-2.5 items-center gap-1.5 rounded-full bg-positive/15 px-2.5 py-3 text-[0.65rem] font-semibold text-positive">
            <span className="heroB-pulse h-1.5 w-1.5 rounded-full bg-positive" />
            ao vivo
          </span>
        </div>

        {/* gauge arc */}
        <div className="relative mx-auto mt-5 aspect-[2/1.15] w-full max-w-[20rem]">
          <Gauge />
        </div>

        {/* spectrum scatter */}
        <div className="relative mt-4 h-40 w-full overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-r from-vote-no/10 via-white/[0.03] to-vote-yes/10">
          {/* axis labels */}
          <div className="absolute inset-x-3 top-2 flex justify-between text-[0.6rem] font-bold uppercase tracking-wider">
            <span className="text-vote-no/90">Não</span>
            <span className="text-navy-300">Neutro</span>
            <span className="text-vote-yes/90">Sim</span>
          </div>
          {/* center "você" line */}
          <div className="heroB-youline absolute bottom-3 top-7 left-[58%] w-px bg-accent-500/70">
            <span className="absolute -top-0.5 -left-[1.4rem] rounded-md bg-accent-500 px-1.5 py-0.5 text-[0.55rem] font-bold text-navy-900 shadow-[0_0_18px_rgba(255,154,46,0.6)]">
              Você
            </span>
          </div>

          {/* agent dots */}
          {AGENTS.map((a) => (
            <div
              key={a.label}
              className="heroB-dot group/dot absolute -translate-x-1/2 -translate-y-1/2"
              style={{
                left: `${a.x}%`,
                top: `${22 + (a.y / 100) * 64}%`,
                animationDelay: `${0.7 + a.delay}s`,
              }}
            >
              <span
                className={cn(
                  "block rounded-full ring-2 ring-navy-800",
                  a.score >= 60
                    ? "bg-vote-yes"
                    : a.score >= 40
                      ? "bg-accent-400"
                      : "bg-vote-no",
                )}
                style={{
                  width: `${10 + (a.score / 100) * 12}px`,
                  height: `${10 + (a.score / 100) * 12}px`,
                  boxShadow:
                    a.score >= 60
                      ? "0 0 16px rgba(14,157,106,0.5)"
                      : a.score >= 40
                        ? "0 0 16px rgba(255,168,69,0.45)"
                        : "0 0 16px rgba(206,58,75,0.45)",
                }}
              />
            </div>
          ))}
        </div>

        {/* footer legend */}
        <div className="mt-4 flex items-center justify-between text-[0.7rem] text-navy-300">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-vote-yes" /> alinhado
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-accent-400" /> parcial
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-vote-no" /> distante
          </span>
        </div>
      </div>

      {/* floating score chip */}
      <div className="heroB-chip absolute -bottom-5 -left-5 hidden rounded-2xl border border-white/12 bg-navy-900 px-5 py-3 shadow-[0_20px_50px_-15px_rgba(0,0,0,0.9)] sm:block">
        <p className="text-[0.6rem] font-semibold uppercase tracking-widest text-navy-300">
          Top match
        </p>
        <p className="font-display text-2xl font-extrabold leading-none text-accent-500">
          94%
        </p>
      </div>
    </div>
  );
}

function Gauge() {
  // Semicircle gauge: needle pointing to ~76% alignment.
  const cx = 100;
  const cy = 96;
  const r = 78;
  const pct = 0.76;
  const angle = Math.PI * (1 - pct); // 180° (left) → 0° (right)
  const nx = cx + r * 0.82 * Math.cos(angle);
  const ny = cy - r * 0.82 * Math.sin(angle);

  return (
    <svg viewBox="0 0 200 110" className="h-full w-full">
      <defs>
        <linearGradient id="heroB-gaugeGrad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="var(--color-vote-no)" />
          <stop offset="50%" stopColor="var(--color-accent-400)" />
          <stop offset="100%" stopColor="var(--color-vote-yes)" />
        </linearGradient>
      </defs>

      {/* track */}
      <path
        d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
        fill="none"
        stroke="rgba(255,255,255,0.1)"
        strokeWidth="13"
        strokeLinecap="round"
      />
      {/* colored progress (full arc, gradient) drawn with dash animation */}
      <path
        className="heroB-arc"
        d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
        fill="none"
        stroke="url(#heroB-gaugeGrad)"
        strokeWidth="13"
        strokeLinecap="round"
      />

      {/* tick marks */}
      {Array.from({ length: 11 }).map((_, i) => {
        const a = Math.PI * (1 - i / 10);
        const x1 = cx + (r + 9) * Math.cos(a);
        const y1 = cy - (r + 9) * Math.sin(a);
        const x2 = cx + (r + 14) * Math.cos(a);
        const y2 = cy - (r + 14) * Math.sin(a);
        return (
          <line
            key={i}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke="rgba(255,255,255,0.25)"
            strokeWidth={i % 5 === 0 ? 2 : 1}
          />
        );
      })}

      {/* needle */}
      <g
        className="heroB-needle"
        style={{ transformOrigin: `${cx}px ${cy}px` }}
      >
        <line
          x1={cx}
          y1={cy}
          x2={nx}
          y2={ny}
          stroke="white"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <circle cx={cx} cy={cy} r="6" fill="white" />
        <circle cx={cx} cy={cy} r="3" fill="var(--color-navy-900)" />
      </g>

      {/* center readout */}
      <text
        x={cx}
        y={cy - 18}
        textAnchor="middle"
        className="heroB-readout"
        fill="#ffffff"
        fontSize="22"
        fontWeight="800"
        fontFamily="var(--font-sora), sans-serif"
      >
        76%
      </text>
    </svg>
  );
}

/* ─── Scoped animations ──────────────────────────────────────────────── */

function HeroBStyles() {
  return (
    <style>{`
      @keyframes heroB-rise {
        from { opacity: 0; transform: translateY(22px); }
        to   { opacity: 1; transform: translateY(0); }
      }
      @keyframes heroB-fade {
        from { opacity: 0; }
        to   { opacity: 1; }
      }
      @keyframes heroB-pop {
        0%   { opacity: 0; transform: translate(-50%, -50%) scale(0.2); }
        70%  { transform: translate(-50%, -50%) scale(1.15); }
        100% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
      }
      @keyframes heroB-needle-sweep {
        from { transform: rotate(-78deg); }
        to   { transform: rotate(0deg); }
      }
      @keyframes heroB-draw {
        from { stroke-dashoffset: 245; }
        to   { stroke-dashoffset: 0; }
      }
      @keyframes heroB-underline-draw {
        from { stroke-dashoffset: 220; }
        to   { stroke-dashoffset: 0; }
      }
      @keyframes heroB-soft-pulse {
        0%, 100% { opacity: 1; transform: scale(1); }
        50%      { opacity: 0.4; transform: scale(0.7); }
      }
      @keyframes heroB-grow {
        from { transform: scaleY(0); }
        to   { transform: scaleY(1); }
      }

      .heroB-anim { opacity: 0; animation: heroB-rise 0.7s cubic-bezier(0.22, 1, 0.36, 1) both; }
      .heroB-motif { animation-name: heroB-rise; animation-duration: 0.9s; }
      .heroB-step-up { animation-name: heroB-rise; }

      .heroB-underline {
        stroke-dasharray: 220;
        stroke-dashoffset: 220;
        animation: heroB-underline-draw 0.9s ease 0.55s forwards;
      }

      .heroB-pulse { animation: heroB-soft-pulse 1.6s ease-in-out infinite; }

      .heroB-dot {
        opacity: 0;
        animation: heroB-pop 0.55s cubic-bezier(0.22, 1, 0.36, 1) both;
      }

      .heroB-youline {
        transform-origin: bottom;
        transform: scaleY(0);
        animation: heroB-grow 0.6s cubic-bezier(0.22, 1, 0.36, 1) 0.6s forwards;
      }

      .heroB-needle {
        animation: heroB-needle-sweep 1.4s cubic-bezier(0.34, 1.4, 0.5, 1) 0.7s both;
      }
      .heroB-arc {
        stroke-dasharray: 245;
        stroke-dashoffset: 245;
        animation: heroB-draw 1.3s ease 0.7s forwards;
      }
      .heroB-readout {
        opacity: 0;
        animation: heroB-fade 0.6s ease 1.4s forwards;
      }
      .heroB-chip {
        opacity: 0;
        animation: heroB-rise 0.7s cubic-bezier(0.22, 1, 0.36, 1) 1.2s both;
      }

      @media (prefers-reduced-motion: reduce) {
        .heroB-anim,
        .heroB-motif,
        .heroB-step-up,
        .heroB-dot,
        .heroB-chip,
        .heroB-readout { animation: none !important; opacity: 1 !important; transform: none !important; }
        .heroB-underline { animation: none !important; stroke-dashoffset: 0 !important; }
        .heroB-arc { animation: none !important; stroke-dashoffset: 0 !important; }
        .heroB-needle { animation: none !important; }
        .heroB-youline { animation: none !important; transform: none !important; }
        .heroB-pulse { animation: none !important; }
      }
    `}</style>
  );
}
