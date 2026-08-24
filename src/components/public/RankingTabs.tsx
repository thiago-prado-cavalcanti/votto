"use client";

/**
 * Tabbed alignment ranking, set as a table.
 *
 * Três abas (Deputados federais / Senadores / Partidos), cada uma uma tabela
 * ordenada com coluna de índice explícita — uma tabela de classificação, não uma
 * grade de cartões (docs/design.md).
 *
 * **A ordenação bate no servidor, e isso não é escolha de arquitetura.** As três
 * leituras respondem a perguntas diferentes e nenhuma é subconjunto da outra: os
 * dez melhores em performance e os dez melhores em alinhamento podem não ter
 * ninguém em comum. Este componente já reordenou em memória as dez linhas que a
 * página havia escolhido *por performance*, e o resultado era uma tabela
 * intitulada "Alinhamento com a base" contendo os dez melhores em performance —
 * uma resposta errada com aparência de certa. Trocar de critério agora refaz a
 * consulta sobre a base inteira (`rerankBenches`).
 *
 * Trocar de **aba** continua sendo local: a resposta traz as três bancadas já
 * ordenadas pelo critério em vigor, então não há nada a perguntar.
 *
 * **A ordenação mora no cabeçalho da coluna, e não numa linha própria acima da
 * tabela.** A tabela já imprime os rótulos das leituras — "Performance
 * política", "Alinhamento com a base" — no alto de cada coluna de números; uma
 * faixa "Ordenar por" repetia esses mesmos rótulos alguns pixels acima, gastando
 * uma banda de papel para dizer duas vezes a mesma coisa. Clicar no cabeçalho é
 * também onde a mão vai procurar. `SortHeader` continua sendo o controle das
 * listas em cartões (`/agentes`, `/partidos`), que não têm coluna onde pendurar
 * isto.
 *
 * O primeiro estado vem renderizado do servidor, então a tabela existe e está
 * correta sem JavaScript — o que se perde sem ele é só a troca de critério.
 *
 * Switching tabs re-keys the body, so the new standings deal in from the top
 * rather than swapping in place — the one moment on the page where motion is
 * triggered by a click instead of the scroll (`.vt-rows`, globals.css).
 */
import * as React from "react";
import Link from "next/link";
import { ButtonLink } from "@/components/ui";
import { ImageWithFallback } from "@/components/public/ImageWithFallback";
import { alignmentInk } from "@/lib/domain/tone";
import { cn } from "@/lib/cn";
import { SortArrow } from "@/components/public/SortArrow";
import { rerankBenches } from "@/lib/actions/ranking";
import {
  RANKING_LABELS,
  type Ranking,
  type RankingDirection,
} from "@/lib/domain/ranking";

export type { RankingRow } from "@/lib/domain/ranking";

function initialsOf(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
}

export function RankingTabs({
  initial,
  isAuthenticated = false,
}: {
  initial: Ranking;
  isAuthenticated?: boolean;
}) {
  const [ranking, setRanking] = React.useState<Ranking>(initial);
  const [active, setActive] = React.useState(initial.benches[0]?.key ?? "");
  const [pending, startTransition] = React.useTransition();
  // A resposta que chegar por último manda, mesmo que outra tenha sido pedida
  // depois: cliques rápidos em critérios diferentes voltam fora de ordem, e sem
  // isto a tabela pode acabar exibindo a ordenação anterior sob o rótulo da nova.
  const requestId = React.useRef(0);

  const current = ranking.benches.find((t) => t.key === active) ?? ranking.benches[0];

  // Colunas: decididas no servidor, sobre a coorte inteira. Perguntar aqui se
  // "alguma das linhas na tela tem valor" escondia a coluna quando os dez
  // primeiros por acaso não tinham a leitura — mesmo com quinhentos agentes que
  // tinham.
  const columns = ranking.available
    .filter((key) => key !== "personal" || isAuthenticated)
    .map((key) => ({ key, label: RANKING_LABELS[key] }));

  // Clicking the column already in force turns the arrow over; clicking another
  // starts it descending, which is the end anybody asks for first.
  const nextFor = (key: string): RankingDirection =>
    key === ranking.sort ? (ranking.direction === "desc" ? "asc" : "desc") : "desc";

  const rerank = (key: string, next: RankingDirection) => {
    const id = ++requestId.current;
    startTransition(async () => {
      const fresh = await rerankBenches(key, next);
      if (id === requestId.current) setRanking(fresh);
    });
  };

  const rows = current?.rows ?? [];

  if (!current) return null;
  const logo = current.avatarShape === "logo";
  // A party mark gets no plate of its own — it fits whole inside its square and
  // `multiply` dissolves the white one some of them are exported on. A portrait
  // keeps the tinted square it is cropped into.
  const avatarClass = logo
    ? "object-contain mix-blend-multiply"
    : "rounded-full bg-navy-100 object-cover";

  return (
    <div>
      {/* Folder tabs: the ink rule runs the full width and the active tab is a
          paper card sitting on it, its bottom edge painted out so tab and panel
          read as one sheet. Every tab is flush with the rule — hence `items-end`
          and the −1px pull, which let the 1px borders land on the same pixel. */}
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2 border-b border-navy-900">
        {/* `w-full` until sm keeps the tab strip on its own line, so the "Ver
            todos" link never wraps *under* it and steals the rule the tabs sit on. */}
        <div className="order-2 -mb-px flex w-full flex-wrap sm:order-none sm:w-auto">
          {ranking.benches.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActive(tab.key)}
              aria-pressed={tab.key === current.key}
              className={cn(
                "border border-b px-[1.375rem] py-3 text-sm font-medium transition-colors",
                tab.key === current.key
                  ? "border-navy-900 border-b-surface bg-surface text-navy-900"
                  : "border-transparent text-[var(--color-muted)] hover:text-navy-900",
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
        {/* Sits on the tab labels' baseline, not down on the rule. */}
        {current.hrefAll ? (
          <ButtonLink
            href={current.hrefAll}
            variant="ghost"
            size="sm"
            className="order-1 mb-1 sm:order-none"
          >
            Ver todos →
          </ButtonLink>
        ) : null}
      </div>

      {rows.length === 0 ? (
        <p className="py-6 text-sm text-[var(--color-muted)]">Sem dados disponíveis.</p>
      ) : (
        <div
          className={cn(
            "overflow-x-auto transition-opacity",
            // A reordenação vai ao servidor, então há uma espera real. A tabela
            // esmaece em vez de sumir: trocar o conteúdo por um esqueleto faria
            // a página saltar, e o que muda é a ordem das mesmas dez linhas.
            pending ? "opacity-50" : null,
          )}
          aria-busy={pending}
        >
          {/* The floor of 26rem is a desktop measure: on a 390px phone it pushed the
              index column — the whole point of the table — off the visible box, so
              ten rows showed no percentage at all. Below `sm` the table fits the
              paper and the name column wraps instead. */}
          <table className="w-full border-collapse text-left sm:min-w-[26rem]">
            <thead>
              <tr className="text-[0.66rem] font-semibold uppercase tracking-[0.14em] text-[var(--color-muted)]">
                <th scope="col" className="w-10 py-2.5 pr-2 font-semibold">
                  #
                </th>
                <th scope="col" className="py-2.5 font-semibold">
                  {logo ? "Partido" : "Agente público"}
                </th>
                <th scope="col" className="hidden py-2.5 font-semibold sm:table-cell">
                  {logo ? "Sigla" : "Partido · UF"}
                </th>
                {columns.map((c) => {
                  const isActive = ranking.sort === c.key;
                  return (
                    <th
                      key={c.key}
                      scope="col"
                      aria-sort={
                        isActive
                          ? ranking.direction === "desc"
                            ? "descending"
                            : "ascending"
                          : "none"
                      }
                      className="py-2.5 pl-3 text-right font-semibold sm:whitespace-nowrap"
                    >
                      <button
                        type="button"
                        onClick={() => rerank(c.key, nextFor(c.key))}
                        className={cn(
                          // `group` so the head can offer its arrow on hover:
                          // an inactive column looks like a label, and nothing
                          // else on the page says the labels are clickable.
                          "group inline-flex items-center gap-1 uppercase tracking-[0.14em] transition-colors",
                          isActive ? "text-navy-900" : "hover:text-navy-900",
                        )}
                      >
                        {c.label}
                        <SortArrow
                          direction={isActive ? ranking.direction : "desc"}
                          className={
                            isActive
                              ? undefined
                              : "opacity-0 transition-opacity group-hover:opacity-45"
                          }
                        />
                      </button>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody key={`${current.key}:${ranking.sort}:${ranking.direction}`} className="vt-rows">
              {rows.map((row, i) => (
                <tr
                  key={row.kid}
                  className="border-t border-line transition-colors hover:bg-navy-50"
                >
                  <td className="py-2.5 pr-2 align-middle">
                    <span
                      className={cn(
                        "vt-num text-base",
                        i === 0 ? "text-accent-500" : "text-navy-400",
                      )}
                    >
                      {i + 1}
                    </span>
                  </td>
                  <td className="py-2.5 align-middle">
                    <Link href={row.href} className="flex items-center gap-3 group">
                      <ImageWithFallback
                        src={row.imageUrl}
                        alt={row.name}
                        className={cn("shrink-0", logo ? "h-8 w-auto max-w-24" : "h-9 w-9", avatarClass)}
                        fallback={
                          <div
                            className={cn(
                              "flex shrink-0 items-center justify-center text-[0.7rem] font-semibold text-navy-700",
                              logo ? "h-8" : "h-9 w-9 rounded-full bg-navy-100",
                            )}
                          >
                            {initialsOf(row.name)}
                          </div>
                        }
                      />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-navy-900 group-hover:underline">
                          {row.name}
                        </span>
                        <span className="block truncate text-xs text-[var(--color-muted)] sm:hidden">
                          {row.subtitle}
                        </span>
                      </span>
                    </Link>
                  </td>
                  <td className="hidden py-2.5 align-middle text-sm text-[var(--color-muted)] sm:table-cell">
                    {row.subtitle || "—"}
                  </td>
                  {columns.map((c) => {
                    const value = row[c.key];
                    return (
                      <td key={c.key} className="py-2.5 pl-3 text-right align-middle">
                        {value !== null ? (
                          <span
                            className="vt-num text-lg"
                            style={{ color: alignmentInk(value) }}
                          >
                            {value}%
                          </span>
                        ) : (
                          <span className="text-xs text-navy-400">—</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
