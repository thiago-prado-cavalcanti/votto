/**
 * O ranking da home — e por que ele não pode ser reordenado no cliente.
 *
 * A tabela oferece três leituras (performance política, alinhamento com a base,
 * alinhamento pessoal) e elas respondem a perguntas diferentes: **nenhuma é
 * subconjunto da outra.** Os dez melhores em performance e os dez melhores em
 * alinhamento podem não ter ninguém em comum.
 *
 * A versão anterior cortava os dez primeiros **por performance** na página e
 * entregava só esses dez ao componente, que reordenava em memória quando o
 * cidadão trocava de critério. O resultado era uma tabela intitulada
 * "Alinhamento com a base" contendo os dez melhores em *performance*, dispostos
 * por alinhamento — uma resposta errada com aparência de certa, que é o pior
 * tipo. O comentário no componente afirmava o contrário ("the table already
 * holds every row it ranks"), o que tornava o defeito invisível na leitura.
 *
 * Aqui a ordenação acontece **sobre a base inteira**, no servidor, antes do
 * corte. Trocar de critério refaz a consulta, exatamente como trocar de
 * ordenação em `/temas` refaz a dela.
 *
 * Uma consulta, dois chamadores — a página e a server action — pelo mesmo motivo
 * que `theme-list.ts`: duas traduções dos mesmos critérios seriam duas chances
 * de a tabela reordenada responder outra pergunta que a renderizada no servidor.
 */
import { db } from "@/lib/db";
import {
  citizenAgentAlignments,
  citizenPartyAlignments,
  agentElectorateAlignments,
  partyElectorateAlignments,
  agentBaseAlignments,
  partyBaseAlignments,
} from "@/lib/indexes/alignment";
import { partyQualityScores } from "@/lib/domain/quality";
import { publicReading } from "@/lib/domain/reading";
import {
  RANKING_SORTS,
  topOf,
  type Ranking,
  type RankingDirection,
  type RankingRow,
  type RankingSort,
} from "@/lib/domain/ranking";

export {
  RANKING_SIZE,
  RANKING_SORTS,
  RANKING_LABELS,
  rankingSort,
  rankingDirection,
  topOf,
} from "@/lib/domain/ranking";
export type {
  Ranking,
  RankedBench,
  RankingDirection,
  RankingRow,
  RankingSort,
} from "@/lib/domain/ranking";

/**
 * Montar o ranking das três bancadas, ordenado sobre a base inteira.
 *
 * @param sort      Critério em vigor.
 * @param direction Sentido da ordenação.
 * @param citizen   Identificação do cidadão logado, quando houver — é o que
 *                  permite a coluna "Seu alinhamento". Ausente para visitante.
 */
export async function rankBenches(
  sort: RankingSort,
  direction: RankingDirection,
  citizen: { id: string; voteVersion: number } | null,
): Promise<Ranking> {
  const [deputies, senators, allParties] = await Promise.all([
    db.publicAgent.findMany({
      where: { status: "ACTIVE", inOffice: true, type: "FEDERAL_DEPUTY" },
      include: { party: true },
    }),
    db.publicAgent.findMany({
      where: { status: "ACTIVE", inOffice: true, type: "SENATOR" },
      include: { party: true },
    }),
    db.party.findMany({ where: { status: "ACTIVE" } }),
  ]);

  const [agentEngage, partyEngage, agentBase, partyBase, partyQuality] = await Promise.all([
    agentElectorateAlignments(),
    partyElectorateAlignments(),
    agentBaseAlignments(),
    partyBaseAlignments(),
    partyQualityScores(),
  ]);

  // O alinhamento pessoal só existe para quem está logado, e a coluna some para
  // visitante — mas some porque não há sessão, não porque as dez linhas
  // carregadas por acaso não tinham valor.
  const [agentAlign, partyAlign] = citizen
    ? await Promise.all([
        citizenAgentAlignments(citizen.id, citizen.voteVersion),
        citizenPartyAlignments(citizen.id, citizen.voteVersion),
      ])
    : [null, null];

  type AgentWithParty = Awaited<typeof deputies>[number];
  const toAgentRow = (a: AgentWithParty): RankingRow => ({
    kid: a.kid,
    name: `${a.firstName} ${a.lastName}`.trim(),
    subtitle: [a.party?.acronym ?? a.party?.name, a.state].filter(Boolean).join(" · ") || "—",
    imageUrl: a.imageUrl,
    href: `/agentes/${a.kid}`,
    quality: a.qualityScore,
    base: publicReading(agentBase.get(a.kid), agentEngage.get(a.kid)?.alignment ?? null).value,
    personal: agentAlign?.get(a.kid)?.alignment ?? null,
  });

  const deputyRows = deputies.map(toAgentRow);
  const senatorRows = senators.map(toAgentRow);
  const partyRows: RankingRow[] = allParties.map((p) => ({
    kid: p.kid,
    name: p.name,
    subtitle: p.acronym ?? "",
    imageUrl: p.logoUrl,
    href: `/partidos/${p.kid}`,
    quality: partyQuality.get(p.kid) ?? null,
    base: publicReading(partyBase.get(p.kid), partyEngage.get(p.kid)?.alignment ?? null).value,
    personal: partyAlign?.get(p.kid)?.alignment ?? null,
  }));

  // Sobre TODAS as linhas, não sobre as trinta que sobreviverão ao corte.
  const everyRow = [...deputyRows, ...senatorRows, ...partyRows];
  const available = RANKING_SORTS.filter((key) => {
    if (key === "personal" && !citizen) return false;
    return everyRow.some((r) => r[key] !== null);
  });

  // Um critério pedido mas indisponível cai no primeiro que existe, em vez de
  // devolver uma tabela de traços.
  const effective = available.includes(sort) ? sort : available[0] ?? "quality";

  return {
    benches: [
      {
        key: "deputados",
        label: "Deputados federais",
        rows: topOf(deputyRows, effective, direction),
        hrefAll: "/agentes?type=FEDERAL_DEPUTY",
      },
      {
        key: "senadores",
        label: "Senadores",
        rows: topOf(senatorRows, effective, direction),
        hrefAll: "/agentes?type=SENATOR",
      },
      {
        key: "partidos",
        label: "Partidos",
        // Dez, como as duas bancadas acima: as abas são lidas lado a lado e uma
        // tabela mais curta lê como "há menos partidos", que não é o recorte.
        rows: topOf(partyRows, effective, direction),
        hrefAll: "/partidos",
        avatarShape: "logo",
      },
    ],
    available: [...available],
    sort: effective,
    direction,
  };
}
