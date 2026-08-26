"use client";

/**
 * O ranking pessoal de `/voce`, em três abas — a mesma tabela do ranking da home.
 *
 * ── Por que a mesma forma, e não o mesmo componente ─────────────────────────
 *
 * A forma é deliberadamente idêntica: abas de pasta sobre uma régua de tinta,
 * tabela com coluna de índice, primeiro lugar em terracota, cabeçalho que nomeia
 * cada coluna de números, `.vt-rows` ao trocar de aba. Um cidadão que leu o
 * ranking na home lê este sem reaprender nada, e duas tabelas com a mesma função
 * e desenhos diferentes seriam duas gramáticas para uma coisa só.
 *
 * O `RankingTabs` em si não serve, e a razão não é de estilo. Ele existe para
 * **arbitrar três critérios** (performance, base, pessoal) e por isso reordena no
 * servidor: os dez melhores em performance e os dez melhores em alinhamento
 * podem não ter ninguém em comum, e reordenar em memória as linhas já escolhidas
 * produzia uma tabela com o título de uma leitura e o conteúdo de outra —
 * defeito que já aconteceu e está documentado lá. Aqui existe **um critério só**,
 * alinhamento com quem está lendo. Sem nada a arbitrar não há o que perguntar ao
 * servidor, e com ele viriam junto os cabeçalhos clicáveis, as setas de
 * ordenação, o `useTransition` e o descarte de resposta fora de ordem — quatro
 * mecanismos para uma tabela que não reordena.
 *
 * ── O que esta tem e aquela não ─────────────────────────────────────────────
 *
 * **Altura reservada.** As abas de lá têm sempre dez linhas; as daqui podem vir
 * vazias — é comum votar só em projetos da Câmara e não ter nenhum senador — e
 * sem reserva a página inteira abaixo saltava a cada clique. Pior: a aba vazia
 * lia como erro de carregamento em vez de "você ainda não votou nessa casa".
 *
 * **Mensagem de vazio por casa**, pelo mesmo motivo: "Sem dados disponíveis" não
 * diz o que fazer, e aqui há exatamente uma coisa a fazer.
 */
import * as React from "react";
import Link from "next/link";
import { ButtonLink } from "@/components/ui";
import { ImageWithFallback } from "@/components/public/ImageWithFallback";
import { alignmentInk } from "@/lib/domain/tone";
import { cn } from "@/lib/cn";
import type { CitizenRankRow } from "@/lib/domain/citizen";

export interface RankingBench {
  key: string;
  label: string;
  rows: CitizenRankRow[];
  /** Marca de partido é retangular; retrato é redondo. */
  avatar: "portrait" | "logo";
  /** O que dizer quando a aba está vazia — nomeia a casa que falta. */
  empty: string;
  /** Para onde vai o "Ver todos →". */
  hrefAll: string;
}

/**
 * Altura de uma linha e do cabeçalho, em px — **impostas**, não estimadas.
 *
 * A altura reservada é `HEAD_PX + size × ROW_PX`, e ela só é honesta se a tabela
 * medir exatamente isso. A primeira versão calculava o número a partir do
 * conteúdo e errava por cinco pixels, porque quem manda na linha não é o retrato
 * e sim a coluna de texto — de modo que a aba vazia ficava mais curta que a
 * cheia, que é o salto que isto existe para eliminar.
 *
 * Então a mesma constante é a altura da `<tr>` **e** a parcela da reserva: as
 * duas não podem divergir por construção, e mexer no tipo da tabela não reabre o
 * defeito. Numa tabela, `height` numa linha vale como mínimo, então conteúdo que
 * cresça empurra as duas juntas.
 */
const ROW_PX = 57;
const HEAD_PX = 36;

export function PersonalRanking({
  benches,
  size,
}: {
  benches: RankingBench[];
  /** Quantas linhas a aba mais cheia pode ter — daqui sai a altura reservada. */
  size: number;
}) {
  const [active, setActive] = React.useState(benches[0]?.key ?? "");
  const bench = benches.find((b) => b.key === active) ?? benches[0];
  if (!bench) return null;

  const logo = bench.avatar === "logo";
  // Uma bancada só imprime a coluna de qualificação se as suas linhas tiverem
  // uma. Lido da primeira linha e não de `logo`: a regra é sobre o dado, e o
  // formato do retrato é uma coincidência que já se desfez uma vez.
  const qualifica = bench.rows[0]?.qualifier != null;

  return (
    <div>
      {/* Abas de pasta: a régua de tinta corre a largura toda e a aba corrente é
          um cartão de papel apoiado nela, com a borda de baixo apagada para que
          aba e painel leiam como uma folha só. Todas encostam na régua — daí o
          `items-end` e o −1px, que fazem as bordas de 1px caírem no mesmo pixel.
          Igual à home, e é a razão de ser igual: a mesma tabela, o mesmo gesto. */}
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2 border-b border-navy-900">
        <div className="order-2 -mb-px flex w-full flex-wrap sm:order-none sm:w-auto">
          {benches.map((b) => (
            <button
              key={b.key}
              type="button"
              onClick={() => setActive(b.key)}
              aria-pressed={b.key === bench.key}
              className={cn(
                "border border-b px-[1.375rem] py-3 text-sm font-medium transition-colors",
                b.key === bench.key
                  ? "border-navy-900 border-b-surface bg-surface text-navy-900"
                  : "border-transparent text-[var(--color-muted)] hover:text-navy-900",
              )}
            >
              {b.label}
            </button>
          ))}
        </div>
        <ButtonLink
          href={bench.hrefAll}
          variant="ghost"
          size="sm"
          className="order-1 mb-1 sm:order-none"
        >
          Ver todos →
        </ButtonLink>
      </div>

      {/* A reserva mora AQUI e não na `<tbody>`: é este contêiner que a mensagem
          de vazio também ocupa, e é a altura dele que a página abaixo enxerga.

          `vt-rows-viewport` no lugar de `overflow-x-auto`, e a troca não é
          cosmética: `overflow-x: auto` promove o eixo vertical a `auto` junto, e
          como as linhas reentram deslocadas para baixo, uma barra de rolagem
          vertical piscava a cada troca de aba. A regra mora em globals.css, ao
          lado do keyframe de que ela depende. */}
      <div className="vt-rows-viewport">
        <div style={{ minHeight: HEAD_PX + size * ROW_PX }}>
          {bench.rows.length === 0 ? (
            <p className="max-w-[46ch] py-8 text-sm leading-relaxed text-[var(--color-muted)]">
              {bench.empty}
            </p>
          ) : (
            <table className="w-full border-collapse text-left sm:min-w-[26rem]">
              <thead>
                <tr className="text-[0.66rem] font-semibold uppercase tracking-[0.14em] text-[var(--color-muted)]">
                  <th scope="col" className="w-10 py-2.5 pr-2 font-semibold">
                    #
                  </th>
                  <th scope="col" className="py-2.5 font-semibold">
                    {logo ? "Partido" : "Agente público"}
                  </th>
                  {/* Sem coluna de qualificação nos partidos: a marca curada já
                    traz a sigla no lettering do próprio partido (§9), e uma
                    coluna "Sigla" ao lado dela imprime a mesma palavra duas
                    vezes — a segunda na tipografia errada. */}
                  {qualifica ? (
                    <th
                      scope="col"
                      className="hidden py-2.5 font-semibold sm:table-cell"
                    >
                      Partido · UF
                    </th>
                  ) : null}
                  {/* O denominador é uma coluna, com nome. Ele muda de sentido
                    entre as abas — temas votados em comum de um lado, membros
                    medidos do outro —, então o cabeçalho muda com ele. */}
                  <th
                    scope="col"
                    className="hidden py-2.5 pl-3 text-right font-semibold sm:table-cell sm:whitespace-nowrap"
                  >
                    {logo ? "Bancada medida" : "Temas em comum"}
                  </th>
                  <th
                    scope="col"
                    className="py-2.5 pl-3 text-right font-semibold sm:whitespace-nowrap"
                  >
                    Alinhamento
                  </th>
                </tr>
              </thead>
              {/* A `key` refaz o corpo a cada troca, então a classificação nova
                entra de cima em vez de trocar no lugar — `.vt-rows`, o único
                momento da página em que o movimento nasce de um clique e não da
                rolagem. */}
              <tbody key={bench.key} className="vt-rows">
                {bench.rows.map((row, i) => (
                  <tr
                    key={row.kid}
                    style={{ height: ROW_PX }}
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
                      <Link
                        href={row.href}
                        className="group flex items-center gap-3"
                      >
                        <ImageWithFallback
                          src={row.imageUrl}
                          alt={row.name}
                          className={cn(
                            "shrink-0",
                            logo
                              ? "h-8 w-auto max-w-24 object-contain mix-blend-multiply"
                              : "h-9 w-9 rounded-full bg-navy-100 object-cover",
                          )}
                          fallback={
                            <div
                              className={cn(
                                "flex shrink-0 items-center justify-center text-[0.7rem] font-semibold text-navy-700",
                                logo
                                  ? "h-8"
                                  : "h-9 w-9 rounded-full bg-navy-100",
                              )}
                            >
                              {row.initials}
                            </div>
                          }
                        />
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium text-navy-900 group-hover:underline">
                            {row.name}
                          </span>
                          {/* Abaixo do `sm` as duas colunas somem, então a
                            qualificação e o denominador voltam para debaixo do
                            nome — senão o telefone mostra uma porcentagem sem
                            nada que a sustente. */}
                          <span className="block truncate text-xs text-[var(--color-muted)] sm:hidden">
                            {row.qualifier} · {row.basis}{" "}
                            {logo
                              ? "medidos"
                              : row.basis === "1"
                                ? "tema"
                                : "temas"}
                          </span>
                        </span>
                      </Link>
                    </td>
                    {qualifica ? (
                      <td className="hidden py-2.5 align-middle text-sm text-[var(--color-muted)] sm:table-cell">
                        {row.qualifier}
                      </td>
                    ) : null}
                    <td className="hidden py-2.5 pl-3 text-right align-middle sm:table-cell">
                      <span className="vt-num text-base text-navy-600">
                        {row.basis}
                      </span>
                    </td>
                    <td className="py-2.5 pl-3 text-right align-middle">
                      <span
                        className="vt-num text-lg"
                        style={{ color: alignmentInk(row.alignment) }}
                      >
                        {row.alignment}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
