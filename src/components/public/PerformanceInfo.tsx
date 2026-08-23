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
import { QUALITY_PILLARS } from "@/lib/indexes/quality";

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
          três pesam igual.
        </p>

        <dl className="mt-5 divide-y divide-[var(--color-line)] border-y border-line">
          {QUALITY_PILLARS.map((pillar) => (
            <Point key={pillar.key} term={pillar.label}>
              {EXPLANATION[pillar.key] ?? ""}
            </Point>
          ))}
        </dl>

        <h3 className="mt-6 text-[0.6875rem] font-semibold uppercase tracking-[0.2em] text-navy-500">
          Três coisas que vale saber
        </h3>

        <dl className="mt-3 divide-y divide-[var(--color-line)] border-y border-line">
          <Point term="É proporção ao melhor, não nota de prova">
            Cada barra compara o parlamentar com o melhor dos colegas da mesma casa —
            e, no custo político, do mesmo estado, porque o teto da cota varia com a
            distância de Brasília. Se quem mais compareceu esteve em 200 votações, 200 é
            100% e 100 votações é 50%. No custo a leitura se inverte: o gabinete mais
            barato é 100%, e um que custa o dobro disso é 50%. O número cru aparece
            sempre ao lado da barra.
          </Point>
          <Point term="Custo político não é o dinheiro que ele traz">
            É a média mensal do que o mandato consome: gabinete, viagens, combustível,
            divulgação, segurança. Emenda parlamentar não entra. Quem garantiu um bilhão
            para escolas no seu estado não é um parlamentar caro — seria o contrário da
            verdade medir as duas coisas juntas.
          </Point>
          <Point term="Sem medida é sem nota, nunca zero">
            Quando falta o dado de um pilar, o peso dele é redistribuído entre os
            outros; se faltar mais da metade, não publicamos nota nenhuma. Um
            parlamentar que não deu para medir não é um parlamentar ruim, e um zero
            seria uma acusação.
          </Point>
        </dl>

        <button
          onClick={onClose}
          className="mt-6 w-full rounded-card border border-navy-300 px-4 py-2.5 text-sm font-medium text-navy-800 transition-colors hover:border-navy-600 hover:text-navy-900"
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
    "O que o parlamentar pôs para andar na casa: projetos que apresentou, contando só os que legislam de fato (PL, PEC, PLP, PDL) e não requerimentos, mais os que relatou. Os que avançaram contam em dobro.",
  cost: "Média mensal da cota parlamentar consumida. Aqui, gastar menos pontua mais.",
};

function Point({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="py-3">
      <dt className="text-[0.95rem] font-medium text-navy-900">{term}</dt>
      <dd className="mt-1 text-[0.9rem] leading-[1.6] text-navy-700">{children}</dd>
    </div>
  );
}
