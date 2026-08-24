"use client";

/**
 * O "?" ao lado de um título, e a folha que ele abre.
 *
 * ── Por que a explicação sai da página ──────────────────────────────────────
 *
 * Uma leitura publicada contra uma pessoa com nome tem de saber se explicar. Mas
 * explicar *na* página custa o espaço que a leitura ocupa — e nas colunas
 * marginais das fichas (19rem) o texto explicativo chegava a ser mais alto que a
 * figura que ele explicava. A explicação continua a um toque de distância e para
 * de disputar a página com o número.
 *
 * ── Por que a casca é compartilhada ─────────────────────────────────────────
 *
 * Portal para o `<body>`, Escape, trava de rolagem e o botão "Entendi" são a
 * mesma coisa em `PerformanceInfo`, aqui e em `FollowDialog`. Três cópias de um
 * comportamento de acessibilidade é como uma delas para de fechar no Escape sem
 * ninguém notar — então a casca mora num lugar só e cada folha traz apenas o
 * conteúdo.
 */
import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * O "?" e a folha, juntos. O rótulo acessível descreve o que a folha responde,
 * não o ícone — "Como a performance política é calculada", nunca "ajuda".
 */
export function InfoButton({
  label,
  eyebrow = "Como é calculada",
  title,
  children,
}: {
  label: string;
  eyebrow?: string;
  title: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={label}
        // A marca fica com 20px; o `after` dá ao dedo os 44 de que ele precisa.
        className="relative ml-1.5 inline-flex size-5 shrink-0 translate-y-[1px] items-center justify-center rounded-full border border-navy-300 text-navy-600 transition-colors hover:border-navy-600 hover:text-navy-900 after:absolute after:-inset-3 after:content-[''] sm:after:hidden"
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          aria-hidden="true"
        >
          <path d="M12 16v-5M12 8h.01" strokeLinecap="round" />
        </svg>
      </button>
      {open ? (
        <InfoSheet label={label} eyebrow={eyebrow} title={title} onClose={() => setOpen(false)}>
          {children}
        </InfoSheet>
      ) : null}
    </>
  );
}

function InfoSheet({
  label,
  eyebrow,
  title,
  onClose,
  children,
}: {
  label: string;
  eyebrow: string;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    // Segura o documento parado por baixo, como `FollowDialog` faz.
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
      aria-label={label}
    >
      <div
        className="max-h-[90dvh] w-full max-w-lg overflow-y-auto overscroll-contain rounded-card bg-surface p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:p-7 sm:pb-7"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[0.6875rem] font-semibold uppercase tracking-[0.2em] text-navy-500">
              {eyebrow}
            </div>
            <h2 className="mt-1.5 font-display text-2xl leading-tight text-navy-900">{title}</h2>
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

        {children}

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

/** Um ponto da folha: o termo e a explicação dele. */
export function Point({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="py-3">
      <dt className="text-[0.95rem] font-medium text-navy-900">{term}</dt>
      <dd className="mt-1 text-[0.9rem] leading-[1.6] text-navy-700">{children}</dd>
    </div>
  );
}

/** A lista de pontos, com as réguas que a folha usa. */
export function Points({ children }: { children: ReactNode }) {
  return <dl className="mt-5 divide-y divide-[var(--color-line)] border-y border-line">{children}</dl>;
}
