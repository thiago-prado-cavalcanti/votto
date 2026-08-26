"use client";

/**
 * O "×" que sai do primeiro acesso, e o aviso que ele abre.
 *
 * ── Sair não é desistir ─────────────────────────────────────────────────────
 *
 * O botão **não** marca `onboardedAt`. Quem fecha no meio não respondeu
 * "não quero"; respondeu "agora não" — e a diferença é o que decide se a
 * plataforma volta a convidar. Marcar aqui apagaria o convite de `/voce` e a
 * pessoa nunca mais encontraria o caminho de volta, que é exatamente o oposto do
 * que o aviso promete.
 *
 * (Há um caminho que marca de propósito: concluir o passo 4. Aquilo é uma
 * resposta completa; isto é uma interrupção.)
 *
 * ── Por que confirma ────────────────────────────────────────────────────────
 *
 * Um "×" no canto de uma tarefa de cinco itens é clicado por engano — é o lugar
 * onde o polegar procura o "voltar". A folha custa um toque a quem quis mesmo
 * sair e devolve a tarefa a quem não quis. E é onde a promessa cabe: *"dá para
 * concluir depois na sua página"*, dita no momento em que ela importa, e não
 * escondida numa ajuda.
 */
import * as React from "react";
import { useRouter } from "next/navigation";
import { Sheet } from "@/components/public/InfoSheet";

/**
 * Dois gatilhos, uma folha só.
 *
 * O "×" do topo e o "Pular" do rodapé fazem a mesma coisa e por isso passam pelo
 * mesmo aviso. Duas saídas com comportamentos diferentes — uma perguntando,
 * outra não — seria a pessoa descobrir a diferença errando.
 *
 * "Pular" só aparece no passo 1, onde não há para onde avançar: os passos
 * seguintes leem os votos, e sem eles não existem. Nos demais, pular é ir ao
 * próximo, que é um link comum.
 */
export function ExitOnboarding({ variant = "icon" }: { variant?: "icon" | "link" }) {
  const [open, setOpen] = React.useState(false);
  const router = useRouter();

  return (
    <>
      {variant === "icon" ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Sair do primeiro acesso"
          className="relative -mr-2 inline-flex size-12 items-center justify-center rounded-card text-navy-600 transition-colors hover:bg-navy-100 hover:text-navy-900"
        >
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
            <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" />
          </svg>
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-sm text-navy-600 transition-colors hover:text-navy-900"
        >
          Pular
        </button>
      )}

      {open ? (
        <Sheet
          label="Sair do primeiro acesso"
          eyebrow="Antes de sair"
          title="Você pode terminar depois"
          onClose={() => setOpen(false)}
          footer={
            <div className="mt-6 flex flex-col gap-3 border-t border-line pt-5 sm:flex-row-reverse">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-card bg-accent-500 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-600"
              >
                Continuar de onde parei
              </button>
              <button
                type="button"
                onClick={() => router.push("/voce")}
                className="rounded-card border border-navy-300 px-5 py-2.5 text-sm font-medium text-navy-800 transition-colors hover:border-navy-600"
              >
                Sair mesmo assim
              </button>
            </div>
          }
        >
          <p className="mt-5 text-[0.95rem] leading-[1.65] text-navy-700">
            Nada do que você já respondeu se perde — os votos ficam gravados. Para retomar o
            percurso de onde parou, é só abrir a sua página{" "}
            <strong className="font-medium text-navy-900">Você</strong>, no menu, e clicar em
            “Retomar”.
          </p>
          <p className="mt-4 text-[0.9rem] leading-[1.6] text-navy-700">
            É lá que ficam, em regime permanente, as mesmas leituras que este percurso apresenta:
            em que áreas você vota, quem vota como você e quem representa você.
          </p>
        </Sheet>
      ) : null}
    </>
  );
}
