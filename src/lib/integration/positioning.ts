/**
 * Recalcular o índice de posicionamento de todos os agentes e partidos (§3.2).
 *
 * É um **lote**, e não um cálculo na hora da leitura, pelo mesmo motivo que
 * `metrics:quality` é: nada aqui se calcula olhando uma pessoa. O peso de um
 * tema é a divisão que ele produziu na casa inteira; a contaminação de uma
 * votação é a correlação, entre todos os agentes, entre o voto e o governismo; e
 * o encolhimento de um partido depende da distribuição de todos os partidos.
 *
 * Lê colunas já gravadas, com uma exceção deliberada — nenhuma. Não há rede
 * aqui: `npm run reposition` é o gêmeo de `requality`, e retunar os pesos é um
 * recálculo.
 *
 * ── A ordem em que as três portas fecham ────────────────────────────────────
 *
 * Um índice publicado errado é pior que índice nenhum, então três checagens
 * correm antes de qualquer escrita, e cada uma pode barrar a casa inteira:
 *
 *  1. **Itens** — a casa precisa de um mínimo de votações classificadas e
 *     divididas. O Senado publicou 14 votações nominais com placar em 18 meses,
 *     mediana de minoria em 4,1%: não há o que escalar ali, e a mensagem do job
 *     diz isso com o número.
 *  2. **Falseamento** — a leitura econômica dos agentes não pode correlacionar
 *     com o governismo deles acima de `MAX_GOVERNMENT_CORRELATION`. Passando
 *     disso, o índice está medindo apoio ao Executivo com rótulo de ideologia,
 *     que é o erro que a literatura brasileira documenta e o único que é
 *     silencioso por construção.
 *  3. **Âncora** — a ordenação partidária do eixo econômico tem de bater com a
 *     do Brazilian Legislative Survey. É o teste que transforma "o PL não pode
 *     ler como Centro" (§11) de julgamento editorial em asserção que roda.
 *
 * As duas últimas exigem a orientação do bloco `Governo`, importada pelos jobs
 * de votação a partir de uma resposta que eles já baixam. Sem ela, a porta 2 não
 * pode nem ser aberta — e uma porta que não pode ser aberta é uma porta fechada.
 */
import { db } from "@/lib/db";
import { counters, type SyncOptions, type SyncResult } from "@/lib/integration/importer";
import {
  AXIS_KEYS,
  bandGate,
  computePosition,
  DEFAULT_WEIGHT_MODE,
  discrimination,
  MIN_DISCRIMINATION,
  MIN_HOUSE_AGENTS,
  MIN_GOVERNISMO_OPPORTUNITIES,
  MIN_HOUSE_ITEMS,
  parseDimensions,
  POSITIONING_METHODOLOGY,
  type AxisKey,
  type ItemStats,
  type Position,
  type ScorableVote,
  type WeightMode,
} from "@/lib/indexes/positioning";
import {
  agreementIndex,
  betweenVariance,
  excessCohesion,
  pool,
  type Member,
  type PooledEstimate,
} from "@/lib/indexes/pooling";
import {
  anchorFor,
  MAX_GOVERNMENT_CORRELATION,
  MIN_ANCHOR_CORRELATION,
  MIN_SPREAD_RATIO,
  stdDev,
  MAX_AXIS_CORRELATION,
  MIN_ANCHOR_COVERAGE,
  pearson,
  spearman,
  UNANCHORED_PARTIES,
  anchorKey,
} from "@/lib/domain/anchors";
import { AgentType, EntityStatus, House, Prisma, VoteValue } from "@/generated/prisma";

/** Piso de variância para um membro, evitando divisão por zero no encolhimento. */
const VARIANCE_FLOOR = 25;

/** Por que uma casa não foi gravada. */
export type HouseBlock =
  | { kind: "items"; items: number }
  | { kind: "agents"; agents: number }
  | { kind: "orientations" }
  | { kind: "degenerate" }
  | { kind: "governismo"; correlation: number }
  | { kind: "spread"; ratio: number | null }
  | { kind: "anchor"; correlation: number | null; coverage: number };

export interface HouseReport {
  house: House;
  /** Itens classificados, divididos e utilizáveis. */
  items: number;
  /** Itens em que a contaminação governista pôde ser medida. */
  itemsControlled: number;
  agents: number;
  agentsScored: number;
  /** Correlação entre o eixo econômico e o governismo. Quanto menor, melhor. */
  governmentCorrelation: number | null;
  /** Spearman entre a média partidária do eixo econômico e a âncora BLS. */
  anchorCorrelation: number | null;
  /** Fatia das cadeiras medidas cujo partido tem âncora publicada. */
  anchorCoverage: number;
  /**
   * Dispersão das nossas médias partidárias dividida pela da âncora, sobre os
   * mesmos partidos. 1,0 é espalhar tanto quanto a régua; abaixo de
   * `MIN_SPREAD_RATIO` o eixo comprimiu o espectro a ponto de a leitura mentir
   * mesmo com a ordenação certa — coisa que Spearman, sendo de posto, não vê.
   */
  spreadRatio: number | null;
  /**
   * Correlação entre os dois eixos entre os agentes desta casa.
   *
   * Alta é o resultado esperado, não um defeito: nos partidos brasileiros do
   * CHES-LA ela mede 0,94. Acima de `MAX_AXIS_CORRELATION` o eixo social deixa
   * de ser publicado como número próprio e continua alimentando só a figura.
   */
  axisCorrelation: number | null;
  /** Verdadeiro quando o eixo social não sobrevive como leitura independente. */
  socialCollinear: boolean;
  /** Partidos sem âncora, com o motivo, para o relatório. */
  unanchored: string[];
  /** `null` quando a casa passou em tudo. */
  blocked: HouseBlock | null;
}

export interface AgentScore {
  id: string;
  kid: string;
  name: string;
  house: House;
  partyAcronym: string | null;
  position: Position;
  governismo: number | null;
  /** Votações com orientação do Governo que produziram esse percentual. */
  governismoBase: number | null;
}

export interface PartyScore {
  id: string;
  kid: string;
  acronym: string | null;
  house: House;
  economic: PooledEstimate<string> | null;
  social: PooledEstimate<string> | null;
  cohesion: number | null;
}

/** A casa a que um tipo de agente pertence. */
function houseOf(type: AgentType): House | null {
  if (type === AgentType.FEDERAL_DEPUTY) return House.CAMARA;
  if (type === AgentType.SENATOR) return House.SENADO;
  return null;
}

function voteSign(v: VoteValue): number {
  return v === VoteValue.YES ? 1 : v === VoteValue.NO ? -1 : 0;
}

/**
 * Recalcular o índice inteiro.
 *
 * Devolve tudo o que calculou, inclusive o que se recusou a gravar, porque o
 * relatório de `scripts/reposition.ts` é onde a calibragem acontece — e um job
 * que barra uma casa sem dizer o motivo é o estado que essas portas existem para
 * tornar visível.
 */
export async function recomputePositioningIndex(
  opts: {
    dryRun?: boolean;
    onProgress?: SyncOptions["onProgress"];
    /**
     * Modo de peso. Ausente é a metodologia em vigor.
     *
     * Qualquer coisa que não seja `discount` é **medição**: a escrita é
     * recusada logo abaixo, não porque o resultado seja necessariamente pior,
     * mas porque publicar sob um método que não é `POSITIONING_METHODOLOGY`
     * quebraria a única garantia que o carimbo de versão dá — a de que dois
     * números diferentes na mesma coluna foram produzidos pela mesma conta.
     */
    weights?: WeightMode;
  } = {},
): Promise<{
  agents: AgentScore[];
  parties: PartyScore[];
  houses: HouseReport[];
  /** Fatia dos itens usados que ainda vem do formato de tag antigo. */
  legacyShare: number;
  /** O modo que rodou, para o relatório carimbar o que está lendo. */
  weights: WeightMode;
}> {
  const weights = opts.weights ?? DEFAULT_WEIGHT_MODE;

  // Um modo experimental é medição e nunca chega ao banco. Antes de qualquer
  // leitura: o cálculo leva minutos, e recusar no fim seria cobrar o trabalho
  // inteiro para depois dizer não. O guarda vive aqui e não no script porque
  // quem escreve é esta função — um caller futuro que esqueça `--dry` não deve
  // conseguir publicar uma conta que não é `POSITIONING_METHODOLOGY`.
  if (!opts.dryRun && weights !== DEFAULT_WEIGHT_MODE) {
    throw new Error(
      `Modo de peso "${weights}" é experimental e não é publicável. ` +
        "Rode com --dry, ou adote o modo em POSITIONING_METHODOLOGY " +
        "(version, changedAt, fingerprint) antes de gravar.",
    );
  }
  // ── Agentes ───────────────────────────────────────────────────────────────
  const agents = await db.publicAgent.findMany({
    where: {
      status: EntityStatus.ACTIVE,
      inOffice: true,
      type: { in: [AgentType.FEDERAL_DEPUTY, AgentType.SENATOR] },
    },
    select: {
      id: true,
      kid: true,
      firstName: true,
      lastName: true,
      type: true,
      party: { select: { id: true, kid: true, acronym: true } },
    },
  });
  const agentHouse = new Map<string, House>();
  for (const a of agents) {
    const house = houseOf(a.type);
    if (house) agentHouse.set(a.id, house);
  }

  // ── Governismo, a partir do livro de votações ─────────────────────────────
  const governismo = await computeGovernismo();

  // ── Temas classificados, e o que a casa fez com cada um ───────────────────
  const themes = await db.theme.findMany({
    where: { status: EntityStatus.ACTIVE, dimensions: { not: Prisma.DbNull } },
    select: { id: true, kid: true, dimensions: true },
  });
  const dimensionsByTheme = new Map(
    themes.map((t) => [t.id, { kid: t.kid, dims: parseDimensions(t.dimensions) }]),
  );
  const scorableThemeIds = [...dimensionsByTheme.entries()]
    .filter(([, t]) => t.dims.scoreable)
    .map(([id]) => id);

  // Votos dos parlamentares nesses temas. É `Vote`, e não `RollCallVote`, de
  // propósito: `Vote` guarda a POSIÇÃO do agente sobre a proposição, uma por
  // tema, que é o que um eixo de valor pergunta. O livro de votações responde
  // "compareceu?", que é outra pergunta e pertence à assiduidade.
  const votes = scorableThemeIds.length
    ? await db.vote.findMany({
        where: { voterType: "AGENT", themeId: { in: scorableThemeIds } },
        select: { agentId: true, themeId: true, value: true },
      })
    : [];

  // Divisão do plenário por tema — a discriminação de cada item.
  const tallies = new Map<string, { yes: number; no: number }>();
  for (const v of votes) {
    const t = tallies.get(v.themeId) ?? { yes: 0, no: 0 };
    if (v.value === VoteValue.YES) t.yes++;
    else if (v.value === VoteValue.NO) t.no++;
    tallies.set(v.themeId, t);
  }

  // Contaminação por tema: o quanto aquela votação foi decidida ao longo da
  // linha governo↔oposição. Medida como a correlação, entre os agentes que
  // votaram nela, entre o lado escolhido e o governismo de cada um — não como um
  // sinalizador binário, porque uma votação pode ter orientação do governo e
  // ainda assim dividir a coalizão.
  const votesByTheme = new Map<string, Array<{ agentId: string; sign: number }>>();
  for (const v of votes) {
    if (!v.agentId) continue;
    const sign = voteSign(v.value);
    if (sign === 0) continue;
    const list = votesByTheme.get(v.themeId) ?? [];
    list.push({ agentId: v.agentId, sign });
    votesByTheme.set(v.themeId, list);
  }

  const statsByTheme = new Map<string, ItemStats>();
  for (const [themeId, tally] of tallies) {
    const pairs: Array<{ a: number; b: number }> = [];
    for (const v of votesByTheme.get(themeId) ?? []) {
      const g = governismo.get(v.agentId);
      if (g === undefined) continue;
      pairs.push({ a: v.sign, b: g.score });
    }
    const r = pairs.length >= 10 ? pearson(pairs) : null;
    statsByTheme.set(themeId, {
      yes: tally.yes,
      no: tally.no,
      contamination: r === null ? null : Math.abs(r),
    });
  }

  // ── Escore de cada agente ─────────────────────────────────────────────────
  const votesByAgent = new Map<string, Array<{ themeId: string; value: VoteValue }>>();
  for (const v of votes) {
    if (!v.agentId) continue;
    const list = votesByAgent.get(v.agentId) ?? [];
    list.push({ themeId: v.themeId, value: v.value });
    votesByAgent.set(v.agentId, list);
  }

  const scored: AgentScore[] = [];
  let legacyUsedTotal = 0;
  let usedTotal = 0;

  for (const agent of agents) {
    const house = agentHouse.get(agent.id);
    if (!house) continue;

    const scorable: ScorableVote[] = [];
    for (const v of votesByAgent.get(agent.id) ?? []) {
      const theme = dimensionsByTheme.get(v.themeId);
      const stats = statsByTheme.get(v.themeId);
      if (!theme || !stats) continue;
      scorable.push({
        value: v.value,
        dimensions: theme.dims,
        stats,
        themeKey: theme.kid,
      });
    }

    const position = computePosition(scorable, weights);
    const contributing = position.economic.items + position.social.items;
    if (contributing > 0) {
      usedTotal += contributing;
      legacyUsedTotal += contributing * position.legacyShare;
    }

    scored.push({
      id: agent.id,
      kid: agent.kid,
      name: `${agent.firstName} ${agent.lastName}`.trim(),
      house,
      partyAcronym: agent.party?.acronym ?? null,
      position,
      governismo: governismo.get(agent.id)?.score ?? null,
      governismoBase: governismo.get(agent.id)?.base ?? null,
    });
  }

  // ── As portas, por casa ───────────────────────────────────────────────────
  //
  // **Mede tudo primeiro, julga depois.** A versão anterior decidia e saía com
  // `continue`, de modo que uma casa barrada na primeira porta nunca chegava a
  // ter governismo ou âncora calculados — justamente a casa sobre a qual é
  // preciso decidir onde investir. O relatório dizia "só 3 votações" e calava
  // sobre estar a 0,63 ou a 0,10 da âncora, que é a diferença entre faltar
  // classificação e o índice estar medindo outra coisa.
  //
  // As correlações de uma casa barrada são **diagnóstico, não resultado**: com
  // poucos itens elas são instáveis, e nada é gravado de qualquer forma. Vêm
  // sempre acompanhadas da contagem que as relativiza.
  const houses: HouseReport[] = [];
  const passing = new Set<House>();

  for (const house of [House.CAMARA, House.SENADO]) {
    const inHouse = scored.filter((s) => s.house === house);
    if (inHouse.length === 0) continue;

    // Itens utilizáveis: classificados, votados nesta casa e que dividiram.
    const houseThemeIds = new Set<string>();
    for (const agent of inHouse) {
      for (const v of votesByAgent.get(agent.id) ?? []) houseThemeIds.add(v.themeId);
    }
    let items = 0;
    let itemsControlled = 0;
    for (const themeId of houseThemeIds) {
      const stats = statsByTheme.get(themeId);
      const theme = dimensionsByTheme.get(themeId);
      if (!stats || !theme?.dims.scoreable) continue;
      if (discrimination(stats) < MIN_DISCRIMINATION) continue;
      items++;
      if (stats.contamination !== null) itemsControlled++;
    }

    const withReading = inHouse.filter((s) => s.position.economic.value !== null);
    const report: HouseReport = {
      house,
      items,
      itemsControlled,
      agents: inHouse.length,
      agentsScored: withReading.length,
      governmentCorrelation: null,
      anchorCorrelation: null,
      anchorCoverage: 0,
      spreadRatio: null,
      axisCorrelation: null,
      socialCollinear: false,
      unanchored: [],
      blocked: null,
    };

    // ── Medições ────────────────────────────────────────────────────────────

    // Colinearidade dos eixos. Não barra a casa — decide apenas se o segundo
    // NÚMERO é publicado. A figura de dois eixos continua desenhada de qualquer
    // forma: o resíduo separa a direita economicamente liberal (PSDB, NOVO) da
    // moral-autoritária (PL, Republicanos), o que é uma distinção real ainda
    // que valha um décimo da variância.
    const axisPairs = inHouse
      .filter((s) => s.position.economic.value !== null && s.position.social.value !== null)
      .map((s) => ({
        a: s.position.economic.value as number,
        b: s.position.social.value as number,
      }));
    report.axisCorrelation = pearson(axisPairs);
    report.socialCollinear =
      report.axisCorrelation !== null &&
      Math.abs(report.axisCorrelation) > MAX_AXIS_CORRELATION;

    // Falseamento contra o governismo.
    const govPairs = withReading
      .filter((s) => s.governismo !== null)
      .map((s) => ({ a: s.position.economic.value as number, b: s.governismo as number }));
    const govR = govPairs.length >= MIN_HOUSE_AGENTS ? pearson(govPairs) : null;
    report.governmentCorrelation = govR;

    // Âncora externa. Médias partidárias simples aqui de propósito: a régua
    // compara ORDENAÇÃO, e a média encolhida já foi puxada em direção ao centro
    // — validar contra ela seria validar o encolhimento, não o índice.
    const byParty = new Map<string, number[]>();
    for (const s of withReading) {
      if (!s.partyAcronym) continue;
      const list = byParty.get(s.partyAcronym) ?? [];
      list.push(s.position.economic.value as number);
      byParty.set(s.partyAcronym, list);
    }
    const anchorPairs: Array<{ a: number; b: number }> = [];
    let anchoredSeats = 0;
    const unanchored: string[] = [];
    for (const [acronym, values] of byParty) {
      const anchor = anchorFor(acronym);
      if (anchor === null) {
        const why = UNANCHORED_PARTIES[anchorKey(acronym)] ?? "sem âncora publicada";
        unanchored.push(`${acronym} (${why})`);
        continue;
      }
      anchoredSeats += values.length;
      anchorPairs.push({
        a: values.reduce((sum, v) => sum + v, 0) / values.length,
        b: anchor,
      });
    }
    report.unanchored = unanchored.sort();
    report.anchorCoverage = withReading.length > 0 ? anchoredSeats / withReading.length : 0;
    report.anchorCorrelation = spearman(anchorPairs);

    // Dispersão contra a régua, sobre exatamente os pares que a porta 3 usa.
    const ourSd = stdDev(anchorPairs.map((p) => p.a));
    const anchorSd = stdDev(anchorPairs.map((p) => p.b * 100));
    report.spreadRatio =
      ourSd !== null && anchorSd !== null && anchorSd > 0 ? ourSd / anchorSd : null;

    // ── Julgamento, na ordem em que as portas se fecham ─────────────────────
    if (items < MIN_HOUSE_ITEMS) {
      report.blocked = { kind: "items", items };
    } else if (withReading.length < MIN_HOUSE_AGENTS) {
      report.blocked = { kind: "agents", agents: withReading.length };
    } else if (govPairs.length < MIN_HOUSE_AGENTS) {
      report.blocked = { kind: "orientations" };
    } else if (govR === null) {
      // Controle degenerado: há agentes com governismo bastante, mas o valor
      // não varia entre eles (ou o eixo não varia), então `pearson` devolve
      // `null` por divisão por zero.
      //
      // **Isso barrava por acidente antes: `govR !== null && …` deixava passar.**
      // Um controle que não consegue discriminar é um controle que não rodou, e
      // tratar "não rodou" como "passou" é exatamente o erro que a porta existe
      // para impedir. Um resultado que não pode ser falseado não é publicável.
      report.blocked = { kind: "degenerate" };
    } else if (Math.abs(govR) > MAX_GOVERNMENT_CORRELATION) {
      report.blocked = { kind: "governismo", correlation: govR };
    } else if (report.spreadRatio === null || report.spreadRatio < MIN_SPREAD_RATIO) {
      // Antes da âncora de propósito: um eixo achatado torna a correlação de
      // posto que vem a seguir uma ordenação de ruído, então perguntá-la
      // primeiro seria decidir pela estatística que não enxerga o defeito.
      report.blocked = { kind: "spread", ratio: report.spreadRatio };
    } else if (
      report.anchorCoverage < MIN_ANCHOR_COVERAGE ||
      report.anchorCorrelation === null ||
      report.anchorCorrelation < MIN_ANCHOR_CORRELATION
    ) {
      report.blocked = {
        kind: "anchor",
        correlation: report.anchorCorrelation,
        coverage: report.anchorCoverage,
      };
    } else {
      passing.add(house);
    }

    houses.push(report);
  }

  // ── Partidos ──────────────────────────────────────────────────────────────
  const parties = await aggregateParties(scored, agents, passing);

  // ── Escrita ───────────────────────────────────────────────────────────────
  const collinear = new Set(
    houses.filter((h) => h.socialCollinear).map((h) => h.house),
  );

  if (!opts.dryRun) {
    for (const s of scored) {
      const publish = passing.has(s.house);
      const validated = publish;
      // O eixo social colinear continua no detalhe — a figura o desenha — mas
      // sai da coluna publicada, que é a que uma lista ordena e uma placa
      // imprime como leitura própria.
      const publishSocial = publish && !collinear.has(s.house);
      await db.publicAgent.update({
        where: { id: s.id },
        data: {
          positionEconomic: publish ? s.position.economic.value : null,
          positionSocial: publishSocial ? s.position.social.value : null,
          positionDetail: publish
            ? ({
                version: POSITIONING_METHODOLOGY.version,
                economic: s.position.economic,
                social: s.position.social,
                legacyShare: Math.round(s.position.legacyShare * 100) / 100,
                socialCollinear: collinear.has(s.house),
                bands: {
                  economic: bandGate(s.position.economic, validated),
                  social: bandGate(s.position.social, validated),
                },
              } as unknown as object)
            : undefined,
          positionComputedAt: publish ? new Date() : null,
          // Governismo é gravado mesmo com a casa barrada: ele não depende de
          // nenhuma das portas — é uma contagem, não uma inferência — e é
          // justamente o número que explica por que a casa foi barrada.
          governismo: s.governismo,
          governismoBase: s.governismoBase,
        },
      });
    }

    for (const p of parties) {
      await db.party.update({
        where: { id: p.id },
        data: {
          positionEconomic: p.economic?.value ?? null,
          positionSocial: collinear.has(p.house) ? null : (p.social?.value ?? null),
          positionDetail: p.economic
            ? ({
                version: POSITIONING_METHODOLOGY.version,
                house: p.house,
                socialCollinear: collinear.has(p.house),
                economic: p.economic,
                social: p.social,
              } as unknown as object)
            : undefined,
          positionComputedAt: p.economic ? new Date() : null,
          cohesion: p.cohesion,
        },
      });
    }
  }

  opts.onProgress?.({ seen: scored.length, upserted: parties.length });

  return {
    agents: scored,
    parties,
    houses,
    legacyShare: usedTotal > 0 ? legacyUsedTotal / usedTotal : 0,
    weights,
  };
}

/**
 * Governismo por agente: fatia das votações com orientação do bloco `Governo`
 * em que o agente votou com ela.
 *
 * Regra do Basômetro, e ela é deliberadamente dura: só contam as votações em que
 * o Executivo tomou posição explícita (liberação de bancada sai da conta), e
 * qualquer coisa que não seja coincidência exata — inclusive obstrução e
 * abstenção — conta como não apoio. Obstrução é o instrumento da oposição, não
 * indiferença.
 */
async function computeGovernismo(): Promise<Map<string, { score: number; base: number }>> {
  const rollCalls = await db.rollCall.findMany({
    where: { governmentPosition: { not: null } },
    select: { id: true, governmentPosition: true },
  });
  if (rollCalls.length === 0) return new Map();

  const orientation = new Map(rollCalls.map((r) => [r.id, r.governmentPosition]));
  const rollCallVotes = await db.rollCallVote.findMany({
    where: { rollCallId: { in: rollCalls.map((r) => r.id) } },
    select: { agentId: true, rollCallId: true, value: true },
  });

  const tally = new Map<string, { with: number; total: number }>();
  for (const v of rollCallVotes) {
    const want = orientation.get(v.rollCallId);
    if (!want) continue;
    const bucket = tally.get(v.agentId) ?? { with: 0, total: 0 };
    bucket.total++;
    if (v.value === want) bucket.with++;
    tally.set(v.agentId, bucket);
  }

  const out = new Map<string, { score: number; base: number }>();
  for (const [agentId, b] of tally) {
    if (b.total < MIN_GOVERNISMO_OPPORTUNITIES) continue;
    // O denominador viaja junto com a razão: a leitura não é publicável sem ele.
    out.set(agentId, { score: Math.round((b.with / b.total) * 100), base: b.total });
  }
  return out;
}

/**
 * Agregar os agentes em leituras partidárias.
 *
 * Média dos MEMBROS, nunca a pilha de votos dos membros — que é o que a versão
 * anterior fazia, e o que fazia uma bancada de noventa ser decidida por quem
 * mais votou dentro dela.
 *
 * **Uma casa por partido, nomeada.** Câmara e Senado votam projetos diferentes,
 * e Groseclose, Levitt & Snyder (*APSR* 1999) mostraram que escalas de
 * *scorecard* "esticam e deslocam" entre casas justamente por isso — nenhum peso
 * conserta uma diferença de régua. Então a leitura publicada de um partido é a
 * da casa em que ele tem mais membros medidos, e `positionDetail.house` diz
 * qual. Uma média silenciosa das duas seria a média de duas réguas diferentes.
 */
async function aggregateParties(
  scored: AgentScore[],
  agents: Array<{ id: string; party: { id: string; kid: string; acronym: string | null } | null }>,
  passing: Set<House>,
): Promise<PartyScore[]> {
  const partyOf = new Map(
    agents
      .filter((a) => a.party)
      .map((a) => [a.id, a.party as { id: string; kid: string; acronym: string | null }]),
  );

  // Agrupa por (partido × casa), e só onde a casa passou nas portas.
  const groups = new Map<
    string,
    {
      party: { id: string; kid: string; acronym: string | null };
      house: House;
      members: AgentScore[];
    }
  >();
  for (const s of scored) {
    if (!passing.has(s.house)) continue;
    const party = partyOf.get(s.id);
    if (!party) continue;
    const key = `${party.id}:${s.house}`;
    const group = groups.get(key) ?? { party, house: s.house, members: [] };
    group.members.push(s);
    groups.set(key, group);
  }

  // Uma casa por partido: a que mais mediu.
  const best = new Map<string, (typeof groups extends Map<string, infer V> ? V : never)>();
  for (const group of groups.values()) {
    const measured = group.members.filter((m) => m.position.economic.value !== null).length;
    const current = best.get(group.party.id);
    const currentMeasured = current
      ? current.members.filter((m) => m.position.economic.value !== null).length
      : -1;
    if (measured > currentMeasured) best.set(group.party.id, group);
  }

  // τ² por eixo, sobre as médias partidárias observadas — o espalhamento entre
  // partidos, que é o que decide o quanto cada bancada é encolhida.
  const tau2: Record<AxisKey, number> = { economic: 0, social: 0 };
  const grandMean: Record<AxisKey, number> = { economic: 0, social: 0 };
  for (const axis of AXIS_KEYS) {
    const partyMeans: Member[] = [];
    for (const group of best.values()) {
      const members = memberList(group.members, axis);
      if (members.length === 0) continue;
      const values = members.map((m) => m.value);
      const mean = values.reduce((s, v) => s + v, 0) / values.length;
      const se = Math.sqrt(
        members.reduce((s, m) => s + m.standardError ** 2, 0) / (members.length * members.length),
      );
      partyMeans.push({ value: mean, standardError: se || Math.sqrt(VARIANCE_FLOOR) });
    }
    if (partyMeans.length === 0) continue;
    grandMean[axis] =
      partyMeans.reduce((s, m) => s + m.value, 0) / partyMeans.length;
    tau2[axis] = betweenVariance(partyMeans, VARIANCE_FLOOR);
  }

  const cohesion = await computeCohesion();

  const out: PartyScore[] = [];
  for (const group of best.values()) {
    const economic = pool(memberList(group.members, "economic"), grandMean.economic, tau2.economic, {
      varianceFloor: VARIANCE_FLOOR,
    });
    const social = pool(memberList(group.members, "social"), grandMean.social, tau2.social, {
      varianceFloor: VARIANCE_FLOOR,
    });
    out.push({
      id: group.party.id,
      kid: group.party.kid,
      acronym: group.party.acronym,
      house: group.house,
      economic,
      social,
      cohesion: cohesion.get(group.party.id) ?? null,
    });
  }
  return out;
}

/** Os membros de um partido que têm leitura naquele eixo, prontos para agregar. */
function memberList(members: AgentScore[], axis: AxisKey): Array<Member<string>> {
  const out: Array<Member<string>> = [];
  for (const m of members) {
    const reading = m.position[axis];
    if (reading.value === null) continue;
    out.push({
      value: reading.value,
      // Um erro padrão ausente não é zero: sem ele o membro teria peso infinito
      // e decidiria a bancada sozinho.
      standardError: reading.standardError ?? Math.sqrt(VARIANCE_FLOOR),
      payload: m.name,
    });
  }
  return out;
}

/**
 * Coesão de cada partido, em excesso sobre o acaso.
 *
 * Índice de concordância de Hix, Noury & Roland por votação, média sobre as
 * votações, e então descontado o valor esperado sob voto aleatório para aquele
 * tamanho de bancada — sem o desconto, o ranking de coesão seria um ranking do
 * inverso do tamanho da bancada, que é o artefato que Desposato documentou.
 */
async function computeCohesion(): Promise<Map<string, number>> {
  const rows = await db.rollCallVote.findMany({
    select: { rollCallId: true, value: true, agent: { select: { partyId: true } } },
  });

  const perCall = new Map<string, { yes: number; no: number; abstention: number }>();
  for (const r of rows) {
    const partyId = r.agent?.partyId;
    if (!partyId) continue;
    const key = `${partyId}:${r.rollCallId}`;
    const t = perCall.get(key) ?? { yes: 0, no: 0, abstention: 0 };
    if (r.value === VoteValue.YES) t.yes++;
    else if (r.value === VoteValue.NO) t.no++;
    else t.abstention++;
    perCall.set(key, t);
  }

  const sums = new Map<string, { sum: number; n: number; bench: number }>();
  for (const [key, tally] of perCall) {
    const partyId = key.slice(0, key.indexOf(":"));
    const ai = agreementIndex(tally);
    if (ai === null) continue;
    const size = tally.yes + tally.no + tally.abstention;
    const bucket = sums.get(partyId) ?? { sum: 0, n: 0, bench: 0 };
    bucket.sum += ai;
    bucket.n++;
    bucket.bench = Math.max(bucket.bench, size);
    sums.set(partyId, bucket);
  }

  const out = new Map<string, number>();
  for (const [partyId, b] of sums) {
    if (b.n < 10) continue;
    const excess = excessCohesion(b.sum / b.n, b.bench);
    if (excess !== null) out.set(partyId, Math.round(excess * 100));
  }
  return out;
}

/** Entrada do registro de jobs: recalcula o índice a partir do que já está gravado. */
export async function syncPositioning(opts: SyncOptions = {}): Promise<SyncResult> {
  const c = counters();
  const { agents, parties, houses } = await recomputePositioningIndex({
    onProgress: opts.onProgress,
  });
  c.seen = agents.length;
  c.upserted =
    agents.filter((a) => a.position.economic.value !== null).length + parties.length;

  const blocked = houses.filter((h) => h.blocked);
  const watermark = blocked.length
    ? `não gravado — ${blocked.map((h) => `${h.house}: ${describeBlock(h.blocked!)}`).join("; ")}`
    : new Date().toISOString().slice(0, 10);

  return { itemsSeen: c.seen, itemsUpserted: c.upserted, watermark };
}

/** Uma frase explicando por que a casa não foi gravada. */
export function describeBlock(block: HouseBlock): string {
  switch (block.kind) {
    case "items":
      return `só ${block.items} votações classificadas e divididas (mínimo ${MIN_HOUSE_ITEMS})`;
    case "agents":
      return `só ${block.agents} agentes com leitura (mínimo ${MIN_HOUSE_AGENTS})`;
    case "orientations":
      return "sem orientação do bloco Governo — o teste de falseamento não pode rodar";
    case "degenerate":
      return "o governismo não varia entre os agentes — o teste de falseamento não discrimina";
    case "governismo":
      return `o eixo econômico correlaciona ${block.correlation.toFixed(2)} com governismo (máximo ${MAX_GOVERNMENT_CORRELATION})`;
    case "spread":
      return block.ratio === null
        ? "não foi possível medir a dispersão contra a âncora"
        : `o eixo espalha ${(block.ratio * 100).toFixed(0)}% do que a âncora espalha ` +
          `(mínimo ${MIN_SPREAD_RATIO * 100}%) — ordenação sem escala`;
    case "anchor":
      return block.correlation === null
        ? `cobertura de âncora em ${(block.coverage * 100).toFixed(0)}% das cadeiras (mínimo ${MIN_ANCHOR_COVERAGE * 100}%)`
        : `ordenação partidária a ${block.correlation.toFixed(2)} da âncora BLS (mínimo ${MIN_ANCHOR_CORRELATION})`;
  }
}
