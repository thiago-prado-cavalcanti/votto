"use client";

/**
 * Um tema na lista do primeiro acesso: título, descrição curta, cédula — e a
 * folha de detalhe que o cartão abre.
 *
 * ── Por que uma folha, e não a página do tema ───────────────────────────────
 *
 * Quem está no passo 1 está no meio de uma tarefa de cinco itens. Mandá-lo para
 * `/temas/{kid}` para ler a ementa inteira **interrompe a tarefa**: ele sai do
 * percurso, e o caminho de volta é o botão do navegador. A folha mostra o mesmo
 * texto sem tirar ninguém do lugar, e o link para a página completa continua lá
 * dentro, para quem quiser mesmo sair.
 *
 * ── A cédula fica no cartão, e não dentro da folha ──────────────────────────
 *
 * Votar tem de ser possível sem abrir nada. A descrição curta existe justamente
 * para que a maioria decida sem precisar do detalhe; obrigar a abrir para votar
 * transformaria cinco votos em cinco aberturas. A folha repete a cédula por
 * conveniência de quem a abriu — é o mesmo componente e o mesmo estado no
 * servidor, então votar num lugar aparece no outro depois do `refresh`.
 *
 * ── O cartão inteiro não é clicável ─────────────────────────────────────────
 *
 * Só o título e o "ver detalhe". Um cartão-botão com três botões de voto dentro
 * é uma armadilha: o alvo do dedo para "Sim" fica a milímetros do alvo que
 * abriria a folha, e num telefone a diferença entre os dois é um tremor.
 */
import * as React from "react";
import Link from "next/link";
import { Sheet } from "@/components/public/InfoSheet";
import { VoteButtons } from "@/components/public/VoteButtons";

export interface ThemeChoiceItem {
  kid: string;
  title: string;
  summary: string;
  identifier: string | null;
  house: string | null;
  situation: string | null;
  areaLabel: string;
}

export function ThemeChoice({ theme }: { theme: ThemeChoiceItem }) {
  const [open, setOpen] = React.useState(false);

  return (
    <li className="border-t border-line py-5 first:border-t-0 first:pt-0">
      <div className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-[var(--color-muted)]">
        {theme.areaLabel}
        {theme.identifier ? <span className="font-normal"> · {theme.identifier}</span> : null}
      </div>

      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-1.5 block text-left font-display text-[1.15rem] leading-snug text-navy-900 hover:underline"
      >
        {theme.title}
      </button>

      {/* A descrição curta: três linhas da ementa oficial. É o que permite
          decidir sem abrir nada — e por isso é cortada por altura, e não por
          contagem de caracteres, que cortaria no meio de uma palavra. */}
      <p className="mt-2 line-clamp-3 max-w-[60ch] text-sm leading-relaxed text-navy-700">
        {theme.summary}
      </p>

      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-1.5 text-xs text-navy-600 underline underline-offset-4 hover:text-navy-900"
      >
        Ver detalhe
      </button>

      <div className="mt-3">
        <VoteButtons themeKid={theme.kid} isAuthenticated size="sm" />
      </div>

      {open ? (
        <Sheet
          label={`Detalhe de ${theme.title}`}
          eyebrow={[theme.areaLabel, theme.identifier].filter(Boolean).join(" · ")}
          title={theme.title}
          onClose={() => setOpen(false)}
          footer={
            <div className="mt-6 border-t border-line pt-5">
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-navy-600">
                Como você vota?
              </p>
              <div className="mt-3">
                <VoteButtons themeKid={theme.kid} isAuthenticated />
              </div>
              <Link
                href={`/temas/${theme.kid}`}
                className="mt-4 inline-block text-xs text-navy-600 underline underline-offset-4 hover:text-navy-900"
              >
                Abrir a página completa do projeto
              </Link>
            </div>
          }
        >
          <p className="mt-5 text-[0.95rem] leading-[1.65] text-navy-700">{theme.summary}</p>
          {theme.situation ? (
            <p className="mt-4 text-xs leading-relaxed text-[var(--color-muted)]">
              Situação atual: {theme.situation}
              {theme.house ? ` · ${theme.house === "SENADO" ? "Senado Federal" : "Câmara dos Deputados"}` : ""}
            </p>
          ) : null}
        </Sheet>
      ) : null}
    </li>
  );
}
