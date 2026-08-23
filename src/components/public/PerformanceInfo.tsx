"use client";

/**
 * The info affordance beside the "Performance política" heading, and the sheet
 * it opens.
 *
 * A 0–100 attached to a named person has to be able to explain itself on the
 * spot. The plate beside it already shows *what* the number is made of — four
 * pillars, each with its raw figure — but not *how* those become one score, and
 * the two things a reader is most likely to get wrong live in that gap: that
 * the bars are positions among peers rather than grades, and that "custo
 * político" is what the mandate consumes and not what the parliamentarian
 * secures for their state.
 *
 * The weights are read from `QUALITY_PILLARS`, never restated here — the About
 * page kept its own copy of them and it drifted on the first rename.
 *
 * Same portal/Escape/scroll-lock shape as `FollowDialog`, so the two sheets
 * behave identically.
 */
import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { QUALITY_METHODOLOGY, QUALITY_PILLARS } from "@/lib/indexes/quality";

export function PerformanceInfo() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Como a performance política é calculada"
        className="ml-1.5 inline-flex size-5 shrink-0 translate-y-[1px] items-center justify-center rounded-full border border-navy-300 text-navy-600 transition-colors hover:border-navy-600 hover:text-navy-900"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true">
          <path d="M12 16v-5M12 8h.01" strokeLinecap="round" />
        </svg>
      </button>
      {open ? <PerformanceSheet onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function PerformanceSheet({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    // Hold the document still underneath, as FollowDialog does.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  if (typeof window === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-navy-950/55 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Como a performance política é calculada"
    >
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-card bg-surface p-5 sm:p-7"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[0.6875rem] font-semibold uppercase tracking-[0.2em] text-navy-500">
              Como é calculada
            </div>
            <h2 className="mt-1.5 font-display text-2xl leading-tight text-navy-900">
              Performance política
            </h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Fechar"
            className="-mr-1 shrink-0 rounded-card p-1.5 text-navy-500 hover:bg-navy-100"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <p className="mt-5 text-[0.95rem] leading-[1.65] text-navy-700">
          O alinhamento pergunta se um parlamentar concorda{" "}
          <strong className="font-medium text-navy-900">com você</strong>. A performance
          política pergunta outra coisa, que não depende de concordar:{" "}
          <strong className="font-medium text-navy-900">se ele está fazendo o trabalho</strong>.
          São três medidas, todas tiradas do registro oficial da própria casa, e as
          três pesam igual. O método segue o manual da OCDE e do Centro Comum de
          Investigação da União Europeia para índices compostos — o mesmo que sustenta
          o Índice de Desenvolvimento Humano.
        </p>

        <dl className="mt-5 divide-y divide-[var(--color-line)] border-y border-line">
          {QUALITY_PILLARS.map((pillar) => (
            <Point key={pillar.key} term={pillar.label}>
              {EXPLANATION[pillar.key] ?? ""}
            </Point>
          ))}
        </dl>

        <h3 className="mt-6 text-[0.6875rem] font-semibold uppercase tracking-[0.2em] text-navy-500">
          O que vale saber
        </h3>

        <dl className="mt-3 divide-y divide-[var(--color-line)] border-y border-line">
          <Point term="A régua é fixa e publicada, não o melhor colega">
            Cada pilar é medido contra uma meta fixa, não contra quem foi melhor
            naquele momento. Comparecer a todas as votações vale 100; usar metade da
            cota a que se tem direito vale 100. Isso importa por um motivo prático: a
            nota de um parlamentar só muda quando <em>ele</em> muda. Antes, medindo
            contra o melhor da turma, bastava um colega apresentar o dobro de projetos
            para a nota de todos os outros cair pela metade — sem que ninguém tivesse
            feito nada diferente.
          </Point>
          <Point term="Produzir dez vezes mais não vale dez vezes a nota">
            A produção é lida em escala logarítmica, porque a distribuição é
            extremamente desigual: metade da Câmara apresenta cerca de um projeto por
            mês e alguns apresentam trinta. Numa escala linear, esses poucos achatariam
            todo o resto no rodapé — e foi o que aconteceu na versão anterior, em que o
            deputado mediano marcava 5 de 100. A consequência é deliberada: o primeiro
            projeto conta mais que o quadringentésimo.
          </Point>
          <Point term="Protocolar projetos não leva ao topo">
            Apresentar um projeto custa uma assinatura; fazer um projeto andar, não.
            Por isso a apresentação satura: sozinha, ela chega a{" "}
            <strong className="font-medium text-navy-900">80 de 100</strong> nessa
            medida e para. Os últimos vinte pontos só vêm de desfecho — projeto que
            avançou de verdade — ou de relatoria. É a defesa contra encher o gabinete
            de proposições que ninguém vai votar.
          </Point>
          <Point term="Custo político é fração da cota, não reais">
            O teto da cota varia de R$ 41,6 mil no Distrito Federal a R$ 58,5 mil em
            Roraima, porque paga as passagens de volta para casa. Ranquear por reais
            ranqueia a distância de Brasília. Aqui o pilar é a fatia da cota
            efetivamente usada — o que também corrige uma injustiça: um senador do
            Amazonas gastando 57% do que tem direito desembolsa mais reais que um do
            Distrito Federal gastando 79%.
          </Point>
          <Point term="Falhar num pilar não se compra com os outros">
            As três notas entram numa média geométrica, não numa média simples. Numa
            média simples, quem nunca aparece, quem nunca legisla e quem gasta a cota
            inteira terminavam todos com a mesma nota confortável. É o mesmo motivo pelo
            qual o Índice de Desenvolvimento Humano trocou de média em 2010.
          </Point>
          <Point term="Sem medida é sem nota, nunca zero">
            Quando falta o dado de um pilar, o peso dele é redistribuído entre os
            outros; se faltar mais da metade, não publicamos nota nenhuma. Um
            parlamentar que não deu para medir não é um parlamentar ruim, e um zero
            seria uma acusação.
          </Point>
        </dl>

        {/* The edition, stated rather than implied. Fixed goalposts stop a score
            moving when somebody else changes; this is what lets a reader tell
            that a score moved because WE changed the rules. */}
        <p className="mt-5 text-[0.8rem] leading-[1.55] text-navy-500">
          Metodologia{" "}
          <span className="vt-num text-navy-700">{QUALITY_METHODOLOGY.version}</span>, em
          vigor desde{" "}
          {new Date(`${QUALITY_METHODOLOGY.changedAt}T12:00:00`).toLocaleDateString("pt-BR", {
            day: "2-digit",
            month: "long",
            year: "numeric",
          })}
          . Pesos, metas e regras de corte só mudam com uma edição nova — e toda nota
          guarda a edição que a calculou.
        </p>

        <button
          onClick={onClose}
          className="mt-5 w-full rounded-card border border-navy-300 px-4 py-2.5 text-sm font-medium text-navy-800 transition-colors hover:border-navy-600 hover:text-navy-900"
        >
          Entendi
        </button>
      </div>
    </div>,
    document.body,
  );
}

/** One line of prose per pillar, keyed by its registry `key`. */
const EXPLANATION: Record<string, string> = {
  attendance:
    "Votações nominais a que compareceu, entre as que aconteceram enquanto ocupava a cadeira. Afastamento oficial é descontado, e sessão que ele mesmo presidiu também — quem preside está impedido de votar.",
  production:
    "O que o parlamentar pôs para andar na casa: projetos que apresentou, contando só os que legislam de fato (PL, PEC, PLP, PDL) e não requerimentos, mais os que relatou. Os que avançaram contam em dobro, e só apresentar tem teto.",
  cost: "Fatia da cota parlamentar a que tem direito que foi efetivamente usada. Aqui, gastar menos pontua mais.",
};

function Point({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="py-3">
      <dt className="text-[0.95rem] font-medium text-navy-900">{term}</dt>
      <dd className="mt-1 text-[0.9rem] leading-[1.6] text-navy-700">{children}</dd>
    </div>
  );
}
