/**
 * Os tipos e as constantes do ranking — a metade que o cliente pode carregar.
 *
 * Separado de `agent-ranking.ts` por uma razão mecânica, não estética: aquele
 * módulo consulta o banco e o Redis, e a tabela do ranking é um client
 * component. Importar dali **um valor** (e não só um tipo) arrasta `alignment.ts`
 * → `redis.ts` → `ioredis` para o bundle do navegador, e o build falha com
 * `module-not-found` em `dns`/`net`. O typecheck não vê isso; o build vê.
 *
 * Regra para quem mexer: nada aqui pode importar `db`, `redis` ou qualquer
 * índice. É o arquivo que as duas metades compartilham.
 */

/** Quantas linhas cada bancada mostra. */
export const RANKING_SIZE = 10;

/** As três leituras pelas quais uma bancada pode ser ordenada. */
export const RANKING_SORTS = ["quality", "base", "personal"] as const;
export type RankingSort = (typeof RANKING_SORTS)[number];
export type RankingDirection = "asc" | "desc";

/** Rótulo de cada critério. Vive junto da ordenação para não divergir dela. */
export const RANKING_LABELS: Readonly<Record<RankingSort, string>> = {
  quality: "Performance política",
  base: "Alinhamento com a base",
  personal: "Seu alinhamento",
};

export interface RankingRow {
  kid: string;
  name: string;
  subtitle: string;
  imageUrl: string | null;
  href: string;
  quality: number | null;
  base: number | null;
  personal: number | null;
}

export interface RankedBench {
  key: string;
  label: string;
  rows: RankingRow[];
  hrefAll?: string;
  avatarShape?: "portrait" | "logo";
}

export interface Ranking {
  benches: RankedBench[];
  /**
   * Critérios que têm o que dizer, decididos **sobre a coorte inteira**.
   *
   * Isto também estava errado no cliente, e pelo mesmo motivo do corte: ele
   * perguntava se alguma das dez linhas carregadas tinha valor. Se os dez
   * melhores em performance não tivessem alinhamento medido, a coluna sumia —
   * mesmo com quinhentos agentes que o tinham.
   */
  available: RankingSort[];
  sort: RankingSort;
  direction: RankingDirection;
}

/** Aceita só os valores conhecidos: o critério pode chegar da URL ou do cliente. */
export function rankingSort(value: string | undefined): RankingSort {
  return (RANKING_SORTS as readonly string[]).includes(value ?? "")
    ? (value as RankingSort)
    : "quality";
}

export function rankingDirection(value: string | undefined): RankingDirection {
  return value === "asc" ? "asc" : "desc";
}

/**
 * Ordenar uma coorte inteira por um critério e devolver o topo.
 *
 * Sem medida vai para o fim **nos dois sentidos**: quem não foi medido não é o
 * pior, é quem está faltando no ranking. Inverter a direção não pode promovê-lo
 * a primeiro lugar — é o defeito clássico de ordenar `null` como zero, e aqui
 * seria pior que cosmético, porque zero é uma leitura válida nas três escalas.
 */
export function topOf(
  rows: RankingRow[],
  sort: RankingSort,
  direction: RankingDirection,
): RankingRow[] {
  const desc = direction === "desc";
  return [...rows]
    .sort((a, b) => {
      const x = a[sort];
      const y = b[sort];
      if (x === null && y === null) return a.name.localeCompare(b.name);
      if (x === null) return 1;
      if (y === null) return -1;
      return (desc ? y - x : x - y) || a.name.localeCompare(b.name);
    })
    .slice(0, RANKING_SIZE);
}
