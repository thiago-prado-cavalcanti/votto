/**
 * Mandatos presidenciais, e por que o índice precisa saber deles.
 *
 * ── O problema ───────────────────────────────────────────────────────────────
 *
 * `governismo` é a fatia das votações em que o parlamentar votou como o bloco
 * `Governo` foi orientado. A pergunta que ele responde só existe **dentro de um
 * governo**: "votou com Bolsonaro" e "votou com Lula" são fatos diferentes, e a
 * média dos dois não é fato nenhum. Enquanto o corpus foi de dezoito meses da
 * legislatura 57 isso não apareceu; um backfill que atravessa 2019–2026 torna a
 * coluna publicada incoerente para todo deputado reeleito.
 *
 * ── E por que atravessar mesmo assim ─────────────────────────────────────────
 *
 * Porque é a única identificação disponível. Dentro de uma presidência,
 * ideologia e governismo são quase a mesma variável — medido em 24/08/2026,
 * descontar o governismo dos escores levou PL de +59 para +26 e NOVO de +51 para
 * +7, isto é, arrancou justamente o que distinguia os dois partidos que a régua
 * põe mais à direita, e a correlação com a âncora caiu de 0,78 para 0,67.
 *
 * O que separa as duas dimensões é a **troca de presidente**: a posição
 * ideológica de um partido é estável e o governismo dele inverte de sinal.
 * Izumi (*Dados* 59(1), 2016) mede exatamente isso no Senado — a primeira
 * dimensão correlaciona 0,95, 0,93, 0,75 e −0,94/−0,96 com seguir o líder do
 * governo, por legislatura, **com o sinal virando quando o presidente muda**.
 * Zucco & Lauderdale reportam o mesmo na Câmara.
 *
 * Então o corpus precisa das duas presidências e o **controle** precisa saber a
 * qual delas cada votação pertence. As duas metades têm propósitos distintos e
 * não devem ser confundidas:
 *
 *  - **publicado** — governismo do mandato corrente, com o denominador junto.
 *    É o único recorte que um cidadão consegue interpretar.
 *  - **controle** — governismo do mandato *daquela votação*, usado para
 *    residualizar aquela coluna da matriz.
 */

/** Um mandato presidencial, pelas datas em que a orientação do bloco muda de dono. */
export interface PresidentialTerm {
  /** Chave estável, usada para agrupar. Nunca sai do sistema. */
  key: string;
  /** Início inclusive, em ISO. */
  from: string;
  /** Fim exclusivo, ou `null` para o mandato em curso. */
  to: string | null;
}

/**
 * Os mandatos que o corpus alcança.
 *
 * Começa em 2019 porque é onde o backfill começa e porque a orientação de
 * bancada do Senado só existe a partir de 2019 (§8). Uma posse futura é uma
 * entrada nova aqui e nada mais — nenhum outro lugar do código conhece datas de
 * mandato.
 *
 * As datas são de posse, 1º de janeiro, e não de eleição: o que muda de dono é a
 * orientação do bloco `Governo`, e ela muda quando o governo muda.
 */
export const PRESIDENTIAL_TERMS: readonly PresidentialTerm[] = [
  { key: "2019", from: "2019-01-01", to: "2023-01-01" },
  { key: "2023", from: "2023-01-01", to: null },
] as const;

/** O mandato em curso — o recorte do `governismo` publicado. */
export const CURRENT_TERM = PRESIDENTIAL_TERMS[PRESIDENTIAL_TERMS.length - 1];

/**
 * A qual mandato uma data pertence, ou `null` fora de todos.
 *
 * `null` não é erro: uma votação anterior a 2019 simplesmente não tem controle
 * de governismo disponível, e a coluna correspondente fica sem residualizar em
 * vez de ser residualizada contra o governo errado.
 */
export function termOf(date: Date | null | undefined): string | null {
  if (!date) return null;
  const iso = date.toISOString().slice(0, 10);
  for (const term of PRESIDENTIAL_TERMS) {
    if (iso >= term.from && (term.to === null || iso < term.to)) return term.key;
  }
  return null;
}

/** O começo do mandato corrente, para recortar consultas. */
export function currentTermStart(): Date {
  return new Date(`${CURRENT_TERM.from}T00:00:00.000Z`);
}
