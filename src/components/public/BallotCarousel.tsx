"use client";

/**
 * A cédula da primeira tela, rodando entre três projetos inventados.
 *
 * ── Por que três, e não um ──────────────────────────────────────────────────
 *
 * Um projeto só responde "como se vota"; três respondem **"sobre o que se
 * vota"** — que é a pergunta que alguém recém-chegado realmente tem. Os três
 * cobrem áreas diferentes e são todos de apelo amplo, para que a tela não sugira
 * que a plataforma é sobre um assunto.
 *
 * São inventados, com número 000/2026 e redação própria: nenhum é a ementa de um
 * projeto real, porque um texto verdadeiro aqui convidaria a votar de mentira
 * numa coisa de verdade.
 *
 * ── O que a rotação automática obriga ───────────────────────────────────────
 *
 * Conteúdo que se troca sozinho é um problema de acessibilidade antes de ser um
 * recurso (WCAG 2.2.2 exige um jeito de pausar). Três respostas, e nenhuma é
 * opcional:
 *
 *  - **Pausa ao passar o mouse ou ao focar** — quem está lendo não perde a
 *    linha, e quem navega por teclado não é atropelado.
 *  - **Não roda sozinho com `prefers-reduced-motion`**, e sem JavaScript
 *    tampouco: o primeiro item fica, os marcadores continuam funcionando, e a
 *    tela não depende do rodízio para fazer sentido.
 *  - **Marcadores clicáveis**, que também são a rota manual — e o `aria-live`
 *    é `off` de propósito: um leitor de tela sendo interrompido a cada cinco
 *    segundos é pior que não anunciar a troca.
 */
import * as React from "react";

/** Milissegundos que cada projeto fica na tela. */
const DWELL = 5200;

/**
 * Três projetos inventados, de áreas diferentes e apelo amplo.
 *
 * O critério é serem entendidos sem contexto: qualquer pessoa tem opinião sobre
 * fila de hospital, jornada de trabalho e celular na escola. Um projeto que
 * exigisse saber o que é "regime de urgência" ensinaria a votar e não convidaria
 * a votar.
 */
const BILLS = [
  {
    area: "Saúde",
    id: "PL 000/2026",
    title: "Obriga hospitais públicos a informar o tempo de espera em tempo real",
  },
  {
    area: "Trabalho",
    id: "PL 000/2026",
    title: "Reduz a jornada de trabalho para quatro dias por semana",
  },
  {
    area: "Educação e Ciência",
    id: "PL 000/2026",
    title: "Proíbe o uso de celular em sala de aula na rede pública",
  },
] as const;

const OPTIONS = [
  { label: "Sim", color: "var(--color-vote-yes)" },
  { label: "Não", color: "var(--color-vote-no)" },
  { label: "Neutro", color: "var(--color-vote-abstention)" },
] as const;

export function BallotCarousel() {
  const [index, setIndex] = React.useState(0);
  const [paused, setPaused] = React.useState(false);

  React.useEffect(() => {
    if (paused) return;
    // A mesma guarda que o CSS usa. Quem pediu menos movimento não recebe um
    // carrossel — recebe o primeiro item e os marcadores.
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return;

    const id = window.setInterval(() => setIndex((i) => (i + 1) % BILLS.length), DWELL);
    return () => window.clearInterval(id);
  }, [paused]);

  const bill = BILLS[index];

  return (
    <figure
      className="m-0 border-t-2 border-navy-900 pt-5"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      {/* A altura é reservada para as três redações, senão o bloco abaixo pula a
          cada troca — e um salto de layout desmente a ideia de substituição. */}
      <div className="min-h-[5.5rem] sm:min-h-[4.75rem]" aria-live="off">
        {/* A `key` faz o React remontar, e é o que reinicia a animação. */}
        <div key={index} className="vt-swap">
          <span className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-[var(--color-muted)]">
            {bill.area} · {bill.id}
          </span>
          <p className="mt-2 font-display text-[1.35rem] leading-snug text-navy-900">
            {bill.title}
          </p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-px overflow-hidden rounded-card">
        {OPTIONS.map((o) => (
          <div
            key={o.label}
            className="py-4 text-center font-display text-lg text-white"
            style={{ background: o.color }}
          >
            {o.label}
          </div>
        ))}
      </div>

      <div className="mt-4 flex items-center justify-between gap-4">
        <p className="text-xs text-[var(--color-muted)]">
          Você pode mudar de ideia: o voto é sempre reversível, e é sempre anônimo.
        </p>
        <div className="flex shrink-0 gap-1.5">
          {BILLS.map((b, i) => (
            <button
              key={b.title}
              type="button"
              onClick={() => setIndex(i)}
              aria-label={`Ver o exemplo de ${b.area}`}
              aria-current={i === index}
              // Traço e não bolinha: é a mesma gramática da régua dos passos e
              // das barras de medida — esquadria viva, 6px de alvo com o `after`
              // dando ao dedo os 44 de que ele precisa.
              className="relative h-1.5 w-6 transition-colors after:absolute after:-inset-3 after:content-['']"
              style={{ background: i === index ? "var(--color-navy-900)" : "var(--color-navy-200)" }}
            />
          ))}
        </div>
      </div>
    </figure>
  );
}
