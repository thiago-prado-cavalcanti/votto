/**
 * Leitura do índice de posicionamento (§3.2) — a camada fina de consulta.
 *
 * A matemática está em `src/lib/indexes/positioning.ts` e o lote que a roda em
 * `src/lib/integration/positioning.ts`; aqui só se lê, espelhando
 * `quality.ts` ↔ `domain/quality.ts`.
 *
 * **Nada aqui recalcula a posição de um agente ou de um partido.** Pesar um tema
 * pela divisão que ele produziu exige a casa inteira, e encolher um partido
 * exige todos os partidos — então as páginas leem o que o recálculo gravou, que
 * é também o que permite a uma lista ordenar por posição em SQL.
 *
 * A única coisa calculada na hora é a posição do **cidadão**, e ela é calculada
 * dentro do espaço já congelado pelos parlamentares: os pesos dos itens vêm da
 * divisão do plenário, não dos votos de quem está sendo posicionado. Jessee
 * (*AJPS* 60(4), 2016) mostrou o que acontece quando os dois grupos são
 * estimados juntos — a posição publicada de cada parlamentar passa a depender da
 * razão entre cidadãos e parlamentares na base, quer dizer, da taxa de cadastro
 * da plataforma. Um deputado se moveria porque o Votto ganhou usuários.
 */
import "server-only";
import { db } from "@/lib/db";
import { EntityStatus, VoteValue } from "@/generated/prisma";
import {
  computePosition,
  parseDimensions,
  type AxisReading,
  type ItemStats,
  type Position,
  type ScorableVote,
} from "@/lib/indexes/positioning";

/** A leitura que uma página imprime, já resolvida entre gravado e ausente. */
export interface StoredPosition {
  economic: number | null;
  social: number | null;
  /** Detalhe do recálculo (erros padrão, cobertura, item mais influente). */
  detail: {
    economic?: AxisReading;
    social?: AxisReading;
    legacyShare?: number;
    /**
     * Verdadeiro quando o eixo social não sobreviveu como leitura independente.
     *
     * No Brasil os dois eixos correlacionam a 0,94 entre os partidos, então este
     * é o caso esperado. A figura continua desenhando os dois; o que se cala é o
     * segundo número, porque publicá-lo separadamente afirmaria duas leituras
     * independentes onde há uma e um resíduo.
     */
    socialCollinear?: boolean;
  } | null;
  /** Verdadeiro quando há alguma leitura para desenhar. */
  hasReading: boolean;
  /**
   * Só para partidos: o que a agregação fez, impresso ao lado do resultado.
   *
   * A média observada vem junto da encolhida de propósito. Encolher é uma
   * escolha de método, e uma escolha de método que muda o número publicado de um
   * partido tem de ser visível na página onde o número aparece — senão o leitor
   * vê uma medida e não uma decisão.
   */
  party?: {
    observed: number | null;
    dispersion: number | null;
    members: number;
    cohesion: number | null;
  };
}

/** Ler o detalhe gravado, tolerante a um formato anterior do lote. */
export function parsePositionDetail(value: unknown): StoredPosition["detail"] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  const axis = (raw: unknown): AxisReading | undefined => {
    if (!raw || typeof raw !== "object") return undefined;
    const a = raw as Record<string, unknown>;
    if (typeof a.value !== "number" && a.value !== null) return undefined;
    return {
      value: (a.value as number | null) ?? null,
      standardError: typeof a.standardError === "number" ? a.standardError : null,
      items: typeof a.items === "number" ? a.items : 0,
      effectiveItems: typeof a.effectiveItems === "number" ? a.effectiveItems : 0,
      influence:
        a.influence && typeof a.influence === "object"
          ? (a.influence as AxisReading["influence"])
          : null,
    };
  };
  return {
    economic: axis(v.economic),
    social: axis(v.social),
    legacyShare: typeof v.legacyShare === "number" ? v.legacyShare : undefined,
    socialCollinear: v.socialCollinear === true,
  };
}

/** Montar a leitura publicada a partir das colunas gravadas. */
export function storedPosition(row: {
  positionEconomic: number | null;
  positionSocial: number | null;
  positionDetail: unknown;
}): StoredPosition {
  return {
    economic: row.positionEconomic,
    social: row.positionSocial,
    detail: parsePositionDetail(row.positionDetail),
    hasReading: row.positionEconomic !== null || row.positionSocial !== null,
  };
}

/** Posição gravada de um agente. */
export async function getAgentPosition(agentId: string): Promise<StoredPosition> {
  const row = await db.publicAgent.findUnique({
    where: { id: agentId },
    select: { positionEconomic: true, positionSocial: true, positionDetail: true },
  });
  return row
    ? storedPosition(row)
    : { economic: null, social: null, detail: null, hasReading: false };
}

/**
 * Posição gravada de um partido — encolhida em direção à média da casa e
 * limitada a um erro padrão de deslocamento (`src/lib/indexes/pooling.ts`).
 *
 * O que existia antes juntava os votos de todos os agentes do partido numa pilha
 * só e tirava a média. Duas coisas erradas nisso: uma bancada de noventa passava
 * a ser decidida por quem mais votou dentro dela, e uma bancada de um publicava a
 * excentricidade de uma pessoa como a posição de um partido, sem nada na página
 * dizendo que aquilo repousava sobre um mandato.
 */
export async function getPartyPosition(partyId: string): Promise<StoredPosition> {
  const row = await db.party.findUnique({
    where: { id: partyId },
    select: {
      positionEconomic: true,
      positionSocial: true,
      positionDetail: true,
      cohesion: true,
    },
  });
  if (!row) return { economic: null, social: null, detail: null, hasReading: false };

  const base = storedPosition(row);
  const pooled = poolSummary(row.positionDetail);
  return {
    ...base,
    party: {
      observed: pooled.observed,
      dispersion: pooled.dispersion,
      members: pooled.members,
      cohesion: row.cohesion,
    },
  };
}

/** Ler o resumo da agregação gravado pelo lote (`pool()` em `pooling.ts`). */
function poolSummary(value: unknown): {
  observed: number | null;
  dispersion: number | null;
  members: number;
} {
  const empty = { observed: null, dispersion: null, members: 0 };
  if (!value || typeof value !== "object" || Array.isArray(value)) return empty;
  const economic = (value as { economic?: unknown }).economic;
  if (!economic || typeof economic !== "object") return empty;
  const e = economic as Record<string, unknown>;
  return {
    observed: typeof e.observed === "number" ? e.observed : null,
    dispersion: typeof e.dispersion === "number" ? e.dispersion : null,
    members: typeof e.members === "number" ? e.members : 0,
  };
}

/**
 * Posição de um cidadão, calculada na hora **dentro do espaço dos parlamentares**.
 *
 * Os pesos dos itens — discriminação e contaminação — são os do plenário. Nada
 * que um cidadão vote altera o peso de um tema para ninguém, o que é a
 * propriedade que impede a posição publicada de um deputado de se mover com o
 * crescimento da base.
 */
export async function getCitizenPosition(userId: string): Promise<Position> {
  const votes = await db.vote.findMany({
    where: { userId, voterType: "USER" },
    select: {
      value: true,
      themeId: true,
      theme: { select: { kid: true, dimensions: true } },
    },
  });
  if (votes.length === 0) return computePosition([]);

  const stats = await agentTallies(votes.map((v) => v.themeId));

  const scorable: ScorableVote[] = [];
  for (const vote of votes) {
    const stat = stats.get(vote.themeId);
    if (!stat) continue; // Sem divisão do plenário não há peso, e sem peso não há item.
    scorable.push({
      value: vote.value,
      dimensions: parseDimensions(vote.theme.dimensions),
      stats: stat,
      themeKey: vote.theme.kid,
    });
  }
  return computePosition(scorable);
}

/**
 * A divisão do plenário em cada tema, para os pesos.
 *
 * A contaminação governista fica em `null` aqui de propósito: medi-la exige
 * correlacionar, por tema, o voto de cada parlamentar com o governismo dele, o
 * que é trabalho de lote. Para o cidadão isso custa apenas um desconto a menos —
 * a leitura fica ligeiramente mais generosa com pautas do Executivo, e nunca é
 * publicada ao lado de um nome.
 */
async function agentTallies(themeIds: string[]): Promise<Map<string, ItemStats>> {
  const rows = await db.vote.groupBy({
    by: ["themeId", "value"],
    where: {
      voterType: "AGENT",
      themeId: { in: themeIds },
      agent: { status: EntityStatus.ACTIVE },
    },
    _count: { _all: true },
  });

  const out = new Map<string, ItemStats>();
  for (const row of rows) {
    const stat = out.get(row.themeId) ?? { yes: 0, no: 0, contamination: null };
    if (row.value === VoteValue.YES) stat.yes += row._count._all;
    else if (row.value === VoteValue.NO) stat.no += row._count._all;
    out.set(row.themeId, stat);
  }
  return out;
}

/**
 * Coesão publicada de um partido: excesso sobre o acaso, 0–100.
 *
 * Vem gravada porque o valor esperado sob voto aleatório depende do tamanho da
 * bancada, e comparar sem esse desconto produziria um ranking de coesão que é,
 * na prática, um ranking do inverso do tamanho.
 */
export async function partyCohesions(): Promise<Map<string, number>> {
  const rows = await db.party.findMany({
    where: { status: EntityStatus.ACTIVE, cohesion: { not: null } },
    select: { kid: true, cohesion: true },
  });
  return new Map(rows.filter((r) => r.cohesion !== null).map((r) => [r.kid, r.cohesion as number]));
}
