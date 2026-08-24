"use client";

/**
 * The sheet that explains what "acompanhar" means before anything is recorded.
 *
 * This one earns a confirmation step the way few actions do. Declaring who
 * represents you is a political statement about yourself — sensitive data under
 * the LGPD — and it is bound by a rule (one per office) that the citizen has no
 * way of knowing before they meet it. So the sheet says all of it in plain
 * words: what following is, why the platform asks for it instead of asking who
 * you voted for, what it feeds, that it is one per office, that it is
 * revocable, and that nobody ever sees your name attached to it.
 *
 * **Rendered through a portal into `<body>`, and it has to be** — for the same
 * reason `ShareDialog` is. `position: fixed` only tracks the viewport while no
 * ancestor carries a `transform`, `filter`, `backdrop-filter`, `perspective` or
 * `contain`; every screen here is wrapped in `Reveal`, which animates both
 * `transform` and `filter`, so any overlay rendered in place is trapped inside
 * the block it opened from and paints under everything after it. z-index cannot
 * reach across stacking contexts. Leaving the page does.
 */
import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";

export function FollowDialog({
  mode,
  agentName,
  officeLabel,
  pending,
  error,
  onConfirm,
  onClose,
}: {
  mode: "follow" | "unfollow";
  agentName: string;
  /** The office in running prose — "deputado federal". */
  officeLabel: string;
  pending: boolean;
  error: string | null;
  onConfirm: () => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);

    // Hold the document still underneath: a sheet that scrolls the article
    // behind it reads as two pages fighting.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  // Only ever mounted from a click, so there is no server pass to mismatch. The
  // guard is insurance against a future default-open mount.
  if (typeof window === "undefined") return null;

  const isFollow = mode === "follow";

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-navy-950/55 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={isFollow ? "Acompanhar agente público" : "Deixar de acompanhar"}
    >
      <div
        className="max-h-[90dvh] w-full max-w-lg overflow-y-auto overscroll-contain rounded-card bg-surface p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:p-7 sm:pb-7"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[0.6875rem] font-semibold uppercase tracking-[0.2em] text-navy-500">
              {isFollow ? "Acompanhar" : "Deixar de acompanhar"}
            </div>
            <h2 className="mt-1.5 font-display text-2xl leading-tight text-navy-900">
              {agentName}
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

        {isFollow ? (
          <>
            <p className="mt-5 text-[0.95rem] leading-[1.65] text-navy-700">
              O voto é secreto, e o Votto nunca vai perguntar em quem você votou.{" "}
              <strong className="font-medium text-navy-900">Acompanhar</strong> é a
              declaração equivalente, feita por você e desfeita quando quiser: quem
              representa você hoje.
            </p>

            <dl className="mt-5 divide-y divide-[var(--color-line)] border-y border-line">
              <Point term="Você entra na base deste agente">
                O alinhamento publicado no perfil dele passa a ser medido contra os votos
                de quem o acompanha — e não mais contra o conjunto de todos os cidadãos.
                Por associação, o partido dele também.
              </Point>
              <Point term={`Um por cargo — e este é o de ${officeLabel}`}>
                Na urna você elege um só. Enquanto acompanhar este agente, o botão não
                aparece nos outros do mesmo cargo; os demais cargos seguem livres.
              </Point>
              <Point term="Dá para desfazer a qualquer momento">
                Em <span className="whitespace-nowrap">Sua conta</span> você vê quem
                acompanha e deixa de acompanhar em um clique.
              </Point>
              <Point term="Ninguém vê que foi você">
                A ficha do agente mostra apenas quantas pessoas o acompanham. O seu nome
                não aparece ali para ninguém.
              </Point>
            </dl>

            {/* Specific consent, at the moment of the act — the sign-up text
                covers votes on themes, and a declared affiliation is a distinct
                sensitive datum (LGPD art. 5º, II). */}
            <p className="mt-5 text-xs leading-relaxed text-[var(--color-muted)]">
              Ao confirmar, você autoriza o Votto a registrar essa escolha para calcular o
              alinhamento deste agente e do partido dele. É um dado sensível pela LGPD, e
              você pode revogá-la desfazendo o acompanhamento.
            </p>
          </>
        ) : (
          <p className="mt-5 text-[0.95rem] leading-[1.65] text-navy-700">
            Você deixa de fazer parte da base de {agentName}: os seus votos saem do
            cálculo do alinhamento dele e do partido. O cargo de {officeLabel} fica livre
            para você acompanhar outra pessoa.
          </p>
        )}

        {error ? (
          <p className="mt-4 border-l-2 border-[var(--color-vote-no)] pl-3 text-sm text-[var(--color-vote-no)]">
            {error}
          </p>
        ) : null}

        <div className="mt-6 flex items-center justify-end gap-4">
          <button
            onClick={onClose}
            className="text-sm text-[var(--color-muted)] underline hover:text-navy-800"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            disabled={pending}
            className="rounded-card bg-accent-500 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-accent-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending ? "Registrando…" : isFollow ? "Confirmar" : "Deixar de acompanhar"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** One rule-separated point of the explanation: the claim, then the detail. */
function Point({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="py-3.5">
      <dt className="text-sm font-medium text-navy-900">{term}</dt>
      <dd className="mt-1 text-sm leading-relaxed text-[var(--color-muted)]">{children}</dd>
    </div>
  );
}
