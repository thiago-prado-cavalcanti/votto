"use client";

/**
 * HeroB — "papel & pigmento" public hero for Votto.
 *
 * Editorial split kept from the previous concept, but the ambient background
 * (ink base + blurred aurora orbs + 56px grid) is gone: the page is warm paper,
 * structure comes from 1px ink rules, and the right column carries the animated
 * AlignmentRadar, which is the only figure in the composition.
 *
 * The three steps moved out of the dark card into a plain three-column band
 * separated by hairlines.
 *
 * Being the first screen, the hero is also the site's opening beat: the eyebrow,
 * the three headline lines, the lead and the actions settle in sequence, the
 * handwritten grifo draws itself once the word it marks has landed, and the radar
 * comes forward as a figure. Everything is one `.vt-reveal` block per column, so
 * the whole sequence costs two observers.
 */
import * as React from "react";
import { ButtonLink } from "@/components/ui";
import { AlignmentRadar } from "@/components/public/AlignmentRadar";
import { Reveal } from "@/components/public/motion";

/** Delay of a part inside the revealed column (see the motion block in globals.css). */
const beat = (ms: number) => ({ "--vt-d": `${ms}ms` }) as React.CSSProperties;

const STEPS = [
  {
    n: "01",
    title: "Os temas entram",
    body: "Tudo o que a Câmara e o Senado colocam em votação aparece na plataforma.",
  },
  {
    n: "02",
    title: "Você se posiciona",
    body: "Responde sim, não ou neutro em cada tema, sem debate e sem comentário.",
  },
  {
    n: "03",
    title: "Medimos a distância",
    body: "Comparamos seus votos com os dos agentes públicos e partidos. Nenhum dado além do seu nome é armazenado.",
  },
];

export function HeroB() {
  return (
    <section className="relative isolate border-b border-[var(--color-line)]">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        {/* The radar column is sized to hold the mark at its full 33rem; the gap
            is the reference's 56px. Widening the figure any further would start
            costing the headline its line breaks. */}
        <div className="grid items-center gap-14 lg:grid-cols-[0.985fr_1fr]">
          {/* ── Left: editorial column ─────────────────────────────── */}
          {/* `autoplay`: this headline is the page's largest paint. It opens from
              CSS as the markup is parsed rather than waiting to be hydrated. */}
          <Reveal variant="fade" autoplay>
            <p
              className="vt-lift text-[0.7rem] font-semibold uppercase tracking-[0.2em] text-navy-400"
              style={beat(60)}
            >
              Democracia direta
            </p>

            <h1 className="mt-5 font-display text-[2.9rem] font-medium leading-[0.99] tracking-[-0.026em] sm:text-6xl lg:text-[4.2rem]">
              <span className="vt-lift block" style={beat(180)}>
                Sua voz
              </span>
              <span className="vt-lift block" style={beat(300)}>
                transformando
              </span>
              <span className="vt-lift block" style={beat(420)}>
                a{" "}
                <span className="relative inline-block">
                  democracia
                  {/* Grifo à mão, no lugar do sublinhado geométrico. Traçado
                      depois que a palavra assenta, como quem volta para grifar. */}
                  <svg
                    aria-hidden
                    viewBox="0 0 320 14"
                    preserveAspectRatio="none"
                    className="absolute -bottom-0.5 left-0 h-3 w-full"
                  >
                    <path
                      className="vt-draw"
                      style={beat(900)}
                      pathLength={1}
                      d="M2 9 C 60 3, 130 12, 200 6 S 300 4, 318 8"
                      fill="none"
                      stroke="var(--color-accent-500)"
                      strokeWidth="3"
                      strokeLinecap="round"
                    />
                  </svg>
                </span>
                .
              </span>
            </h1>

            <p
              className="vt-lift mt-8 max-w-xl text-base leading-relaxed text-navy-700 sm:text-lg"
              style={beat(560)}
            >
              O Votto é um complemento à democracia representativa. Você vota nos temas em pauta;
              comparamos suas escolhas com os votos registrados de cada agente público e partido.
            </p>

            <div
              className="vt-lift mt-8 flex flex-col gap-3 sm:flex-row sm:items-center"
              style={beat(680)}
            >
              <ButtonLink href="/temas" size="lg">
                Votar nos temas
              </ButtonLink>
              <ButtonLink href="/agentes" variant="ghost" size="lg">
                Ver agentes →
              </ButtonLink>
            </div>
          </Reveal>

          {/* ── Right: the living mark ─────────────────────────────── */}
          <Reveal variant="figure" delay={260} autoplay>
            <AlignmentRadar className="mx-auto block h-auto w-full max-w-[33rem]" />
          </Reveal>
        </div>

        {/* ── Steps band ───────────────────────────────────────────── */}
        <Reveal
          as="ol"
          variant="fade"
          stagger
          step={130}
          className="mt-16 grid gap-10 sm:grid-cols-3 sm:gap-0"
        >
          {STEPS.map((s, i) => (
            <li
              key={s.n}
              className={
                i === 0
                  ? "sm:pr-10"
                  : "sm:border-l sm:border-[var(--color-line)] sm:px-10 last:sm:pr-0"
              }
            >
              <span className="vt-num text-3xl text-accent-500">{s.n}</span>
              <h3 className="mt-3 font-display text-xl font-medium">{s.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-navy-600">{s.body}</p>
            </li>
          ))}
        </Reveal>
      </div>
    </section>
  );
}
