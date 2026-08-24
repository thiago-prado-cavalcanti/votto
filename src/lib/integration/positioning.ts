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
  CLEAN_MAX_CONTAMINATION,
  computePosition,
  DEFAULT_WEIGHT_MODE,
  discrimination,
  MIN_DISCRIMINATION,
  MIN_EFFECTIVE_ITEMS,
  recoveredWeigher,
  MIN_HOUSE_AGENTS,
  MIN_GOVERNISMO_OPPORTUNITIES,
  MIN_HOUSE_ITEMS,
  parseDimensions,
  POSITIONING_METHODOLOGY,
  type AxisKey,
  type ItemStats,
  type Position,
  type ThemeDimensions,
  type AxisKey as PositioningAxisKey,
  type ItemWeigher,
  type ScorableVote,
  type WeightMode,
} from "@/lib/indexes/positioning";
import {
  recoverAxis,
  residualiseScores,
  type RecoveryDiagnostics,
  type RecoveryItem,
  type RecoveryVote,
} from "@/lib/indexes/recovery";
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
  MIN_SIGNAL_RATIO,
  pearson,
  spearman,
  weightedSpearman,
  UNANCHORED_PARTIES,
  anchorKey,
} from "@/lib/domain/anchors";
import { isPolicyBill } from "@/lib/domain/bill-types";
import { CURRENT_TERM, currentTermStart, termOf } from "@/lib/domain/terms";
import { AgentType, EntityStatus, House, Prisma, VoteValue } from "@/generated/prisma";

/** Piso de variância para um membro, evitando divisão por zero no encolhimento. */
const VARIANCE_FLOOR = 25;

/**
 * Quantos temas por consulta ao buscar os votos dos parlamentares.
 *
 * Existe por memória e não por velocidade. Uma casa com quinhentos agentes e mil
 * temas votados são quinhentas mil linhas; o pico não é a matriz — que é
 * `Float64Array` e cabe em poucos megabytes — mas o array de objetos que o
 * Prisma materializa de uma vez. Duzentos temas mantêm cada lote na ordem de
 * grandeza que o índice já processava antes do backfill de 2019.
 */
const VOTE_FETCH_BATCH = 200;

/**
 * O que um tema sem passagem pela IA vale para o estimador de recuperação.
 *
 * Admissível e sem tag: entra na matriz, e `MIN_DISCRIMINATION` decide se
 * carrega informação. Nenhum eixo marcado significa que ele não orienta nada —
 * só contribui com a coluna de votos, que é tudo o que o componente principal
 * pede.
 */
const UNTAGGED_DIMENSIONS: ThemeDimensions = {
  version: 0,
  scoreable: true,
  reason: null,
  economic: null,
  social: null,
  salience: 0,
  yesMeans: null,
  evidence: null,
  legacy: false,
};

/**
 * De onde saem a direção e o peso de cada votação.
 *
 * `tags` é a metodologia em vigor: pergunta ao classificador. `pca` recupera as
 * duas coisas do componente principal da matriz de votos e usa as tags apenas
 * para orientar qual ponta do eixo é "Mercado" (`src/lib/indexes/recovery.ts`).
 *
 * Existe porque a medição de 24/08/2026 fechou o diagnóstico contra `tags`:
 * ponderar não era o defeito (`--weights=raw` dobrou a correlação com o
 * governismo e não moveu a dispersão) e selecionar item não era o conserto
 * (`--weights=clean` devolveu escala e derrubou a âncora para 0,27, com o PT
 * lendo à direita do PL sobre bancadas de dezenas). §11.
 */
export type Estimator = "tags" | "pca";

/**
 * Quantos partidos de cada ponta da régua decidem para que lado o eixo aponta.
 *
 * Três, e o número é conservador de propósito: com um só, uma bancada pequena e
 * excêntrica decidiria a orientação de toda a casa.
 */
const ORIENTATION_POLES = 3;

/**
 * Nomear as pontas de um eixo recuperado.
 *
 * ── Por que isto não é circular, e onde exatamente ele custa ─────────────────
 *
 * Um componente principal **não tem sinal**: `+v` e `−v` explicam a mesma
 * variância, e nada dentro da matriz de votos diz qual das duas pontas se chama
 * "Mercado". Orientar não é medir; é rotular. É por isso que todo método desta
 * família — W-NOMINATE, Optimal Classification, análise fatorial — orienta *post
 * hoc*, por referência externa, e ninguém chama isso de circularidade.
 *
 * A rodada de 24/08/2026 mostrou o que acontece sem uma referência confiável: o
 * eixo saiu com |ρ| = 0,79 contra a âncora — o espectro brasileiro inteiro, de
 * PSOL a PL — e **espelhado**, porque a orientação vinha das tags e a
 * concordância delas era −0,10 na Câmara. Um bit decidido por ruído inverte a
 * leitura de 498 deputados.
 *
 * Então o bit vem da âncora, e vem de forma limitada e declarada: dos
 * `ORIENTATION_POLES` partidos mais à esquerda e mais à direita **entre os que
 * a casa tem e a régua cobre**. O eixo é virado, se preciso, para que a média
 * dos primeiros fique abaixo da média dos segundos.
 *
 * **O custo é real e tem tamanho.** A porta 4 compara a nossa ordenação
 * partidária com a régua por Spearman sobre ~16 partidos; fixando o sinal por 6
 * deles, o que resta de teste são os outros ~10 mais a *magnitude* sobre todos.
 * Ou seja: a porta passa a testar a ordenação, não o sinal. Isso tem de estar
 * escrito na metodologia — dizer "ρ ≥ 0,85 contra o BLS" sem dizer que o sinal
 * veio do BLS seria descrever um teste mais forte do que o que roda.
 *
 * O que a porta continua pegando, e é o que importa: um eixo que ordene PSOL
 * junto de PL, ou que ponha o centrão nos extremos, reprova com o sinal fixado
 * do mesmo jeito. Foi exactamente assim que o estimador de tags reprovou.
 */
function orientAxis(
  partyMeans: Array<{ acronym: string; mean: number }>,
): { flip: -1 | 1; left: string[]; right: string[] } {
  const anchored = partyMeans
    .map((p) => ({ ...p, anchor: anchorFor(p.acronym) }))
    .filter((p): p is { acronym: string; mean: number; anchor: number } => p.anchor !== null)
    .sort((a, b) => a.anchor - b.anchor);

  // Sem régua não há como nomear as pontas. Devolver `1` não é orientar — é
  // deixar como está —, e quem recusa a publicação é a porta 4, que sem âncora
  // não tem cobertura para passar de qualquer forma.
  if (anchored.length < 2 * ORIENTATION_POLES) {
    return { flip: 1, left: [], right: [] };
  }

  const left = anchored.slice(0, ORIENTATION_POLES);
  const right = anchored.slice(-ORIENTATION_POLES);
  const avg = (xs: typeof left) => xs.reduce((sum, p) => sum + p.mean, 0) / xs.length;
  return {
    flip: avg(left) > avg(right) ? -1 : 1,
    left: left.map((p) => p.acronym),
    right: right.map((p) => p.acronym),
  };
}

/** Por que uma casa não foi gravada. */
export type HouseBlock =
  | { kind: "items"; items: number }
  | { kind: "agents"; agents: number }
  | { kind: "orientations" }
  | { kind: "degenerate" }
  | { kind: "noise"; ratio: number }
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
  /**
   * Quantos itens utilizáveis sobrariam a cada teto de contaminação.
   *
   * Existe para escolher o corte do modo `clean` contra a distribuição real em
   * vez de contra a intuição: o subconjunto limpo só é uma opção enquanto
   * couber `MIN_HOUSE_ITEMS` embaixo do teto. `items` é o total sob o modo que
   * rodou, então em `clean` ele já vem cortado — e a comparação entre os dois
   * números é o que diz quanto custou a limpeza.
   */
  contaminationBands: Array<{ maxContamination: number; items: number }>;
  /** Itens utilizáveis sem contaminação medida — inelegíveis para `clean`. */
  itemsUncontrolled: number;
  /**
   * O que a decomposição encontrou, quando o estimador é `pca`. `null` sob
   * `tags`.
   *
   * `tagAgreement` é diagnóstico de qualidade de tag e **não** orienta nada:
   * a concordância entre o sinal que os votos revelam e o que a IA etiquetou.
   * Perto de 0 as tags são ruído — medido em −0,10 na Câmara sobre 164 itens.
   */
  recovery: Record<AxisKey, RecoveryDiagnostics> | null;
  /** Os partidos que nomearam as pontas de cada eixo (`orientAxis`). */
  orientation: Record<AxisKey, { left: string[]; right: string[] }> | null;
  /**
   * A mesma correlação **sem pesar pela bancada**, sobre os mesmos pares.
   *
   * Impressa ao lado da outra de propósito: é o que diz quanto do resultado vem
   * da ponderação, e sem ela ao lado a ponderação seria indistinguível de uma
   * escolha conveniente.
   */
  anchorCorrelationAll: number | null;
  /** Itens descartados por não serem proposição de mérito (`--items=policy`). */
  droppedNonPolicy: number;
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
    /** Teto do modo `clean`. Ignorado nos outros. */
    maxContamination?: number;
    /** Piso de cobertura por eixo. Alterá-lo também torna a rodada não publicável. */
    minEffectiveItems?: number;
    /**
     * Só para `pca`: admitir apenas proposições de mérito, descartando
     * requerimentos e afins (`src/lib/domain/bill-types.ts`).
     */
    policyItemsOnly?: boolean;
    /** De onde vêm direção e peso. Ausente é a metodologia em vigor. */
    estimator?: Estimator;
    /** Só para `pca`: residualizar as colunas contra o governismo antes de decompor. */
    residualise?: boolean;
    /**
     * Só para `pca`: descontar o governismo também dos **escores**, não só das
     * cargas. Muda a ordenação, então é hipótese a medir — ver
     * `residualiseScores`.
     */
    scoreResidual?: boolean;
  } = {},
): Promise<{
  agents: AgentScore[];
  parties: PartyScore[];
  houses: HouseReport[];
  /** Fatia dos itens usados que ainda vem do formato de tag antigo. */
  legacyShare: number;
  /** O modo que rodou, para o relatório carimbar o que está lendo. */
  weights: WeightMode;
  /** O piso que rodou — igual a `MIN_EFFECTIVE_ITEMS` salvo numa medição. */
  minEffectiveItems: number;
  /** O estimador que rodou. */
  estimator: Estimator;
  /** Se o governismo foi descontado também dos escores. */
  scoreResidual: boolean;
  /** Se só proposições de mérito foram admitidas na matriz. */
  policyItemsOnly: boolean;
}> {
  const weights = opts.weights ?? DEFAULT_WEIGHT_MODE;
  const maxContamination = opts.maxContamination ?? CLEAN_MAX_CONTAMINATION;
  const minEffectiveItems = opts.minEffectiveItems ?? MIN_EFFECTIVE_ITEMS;
  const estimator = opts.estimator ?? "tags";
  const residualise = opts.residualise ?? true;
  const scoreResidual = opts.scoreResidual ?? false;
  const policyItemsOnly = opts.policyItemsOnly ?? false;

  // Um modo experimental é medição e nunca chega ao banco. Antes de qualquer
  // leitura: o cálculo leva minutos, e recusar no fim seria cobrar o trabalho
  // inteiro para depois dizer não. O guarda vive aqui e não no script porque
  // quem escreve é esta função — um caller futuro que esqueça `--dry` não deve
  // conseguir publicar uma conta que não é `POSITIONING_METHODOLOGY`.
  //
  // `maxContamination` fica de fora da condição de propósito: ele é inerte em
  // qualquer modo que não seja `clean`, e `clean` já está barrado pelo primeiro
  // termo. Um guarda que checasse um parâmetro sem efeito recusaria rodadas
  // publicáveis por engano.
  const experimental =
    weights !== DEFAULT_WEIGHT_MODE ||
    minEffectiveItems !== MIN_EFFECTIVE_ITEMS ||
    estimator !== "tags" ||
    scoreResidual ||
    policyItemsOnly;
  if (!opts.dryRun && experimental) {
    const why =
      estimator !== "tags"
        ? `estimador "${estimator}"`
        : weights !== DEFAULT_WEIGHT_MODE
          ? `modo de peso "${weights}"`
          : `piso de cobertura em ${minEffectiveItems} (metodologia: ${MIN_EFFECTIVE_ITEMS})`;
    throw new Error(
      `Configuração experimental (${why}) não é publicável. ` +
        "Rode com --dry, ou adote a mudança em POSITIONING_METHODOLOGY " +
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
  const governismoByTerm = await computeGovernismo();
  // **Publicado é o mandato corrente, e só ele.** "Votou com Bolsonaro" e
  // "votou com Lula" são fatos diferentes; a média dos dois não é fato nenhum,
  // e um deputado reeleito teria a coluna somando os dois governos sob um nome.
  // O corpus longo existe para o CONTROLE (ver `terms.ts`), não para a leitura.
  const governismo =
    governismoByTerm.get(CURRENT_TERM.key) ?? new Map<string, { score: number; base: number }>();

  // ── Os temas que entram na conta ──────────────────────────────────────────
  //
  // **E aqui os dois estimadores pedem coisas diferentes.** O de tags precisa de
  // `direction` e `confidence` por item, então só admite tema classificado. O de
  // recuperação não precisa de nenhum dos dois — direção e peso saem do
  // componente principal, e a ponta do eixo sai da âncora —, então restringir a
  // matriz ao que a IA alcançou seria jogar fora a maior parte do acervo por uma
  // exigência que não é dele.
  //
  // Isso não é hipotético: medido em 24/08/2026, depois de um backfill que
  // trouxe as votações de 2019 em diante, a matriz continuou com **217 itens** —
  // exatamente os que a fila da IA tinha classificado. Milhares de votações
  // nominais caíram fora deste `where`, e o piso de ruído de Marchenko–Pastur,
  // que cai com M, continuou onde estava.
  const themes = await db.theme.findMany({
    where:
      estimator === "pca"
        ? { status: EntityStatus.ACTIVE, votes: { some: { voterType: "AGENT" } } }
        : { status: EntityStatus.ACTIVE, dimensions: { not: Prisma.DbNull } },
    select: { id: true, kid: true, dimensions: true, identifier: true },
  });
  // **"Nunca classificado" e "classificado e excluído" não são a mesma coisa**, e
  // `parseDimensions(null)` devolve `scoreable: false` para os dois. A diferença
  // é informação real: `dimensions = null` é a fila da IA que ainda não chegou
  // ali, enquanto `scoreable: false` com tag presente é o classificador dizendo
  // que a votação não é sobre mérito — homenagem, questão de ordem, requerimento
  // procedural. O segundo continua excluído nos dois estimadores; o primeiro
  // entra na matriz do `pca`, que não precisa de tag para nada.
  const dimensionsByTheme = new Map(
    themes.map((t) => [
      t.id,
      {
        kid: t.kid,
        policy: isPolicyBill(t.identifier),
        dims:
          estimator === "pca" && t.dimensions === null
            ? UNTAGGED_DIMENSIONS
            : parseDimensions(t.dimensions),
      },
    ]),
  );
  const scorableThemeIds = [...dimensionsByTheme.entries()]
    .filter(([, t]) => t.dims.scoreable)
    .map(([id]) => id);

  // Votos dos parlamentares nesses temas. É `Vote`, e não `RollCallVote`, de
  // propósito: `Vote` guarda a POSIÇÃO do agente sobre a proposição, uma por
  // tema, que é o que um eixo de valor pergunta. O livro de votações responde
  // "compareceu?", que é outra pergunta e pertence à assiduidade.
  //
  // **Em lotes de temas**, e a razão é a mesma de `computeCohesion`: com o
  // acervo de 2019 em diante isto passa de ~100 mil linhas para a ordem do
  // milhão, e o pico de memória é o array que o Prisma devolve, não a matriz
  // (que é `Float64Array` e cabe em alguns megabytes). O laço reduz cada lote
  // para os mapas compactos e solta as linhas.
  const votes: Array<{
    agentId: string | null;
    themeId: string;
    value: VoteValue;
    occurredAt: Date | null;
  }> = [];
  for (let i = 0; i < scorableThemeIds.length; i += VOTE_FETCH_BATCH) {
    const batch = await db.vote.findMany({
      where: { voterType: "AGENT", themeId: { in: scorableThemeIds.slice(i, i + VOTE_FETCH_BATCH) } },
      select: { agentId: true, themeId: true, value: true, occurredAt: true },
    });
    votes.push(...batch);
  }

  // A que mandato cada tema pertence — pela data da votação que fixou a posição
  // vigente. É o que permite medir contaminação e residualizar cada coluna
  // contra o governismo *do governo que estava lá*, e não contra o de agora.
  const termByTheme = new Map<string, string | null>();
  for (const v of votes) {
    const term = termOf(v.occurredAt);
    if (term && !termByTheme.has(v.themeId)) termByTheme.set(v.themeId, term);
  }

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
    // Contra o governismo do mandato DAQUELA votação. Usar o do mandato
    // corrente mediria a coalizão de 2026 numa votação de 2020, o que não é uma
    // medida ruim — é uma medida de outra coisa.
    const termGovernismo = governismoByTerm.get(termByTheme.get(themeId) ?? "");
    const pairs: Array<{ a: number; b: number }> = [];
    for (const v of votesByTheme.get(themeId) ?? []) {
      const g = termGovernismo?.get(v.agentId);
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

  // ── Recuperar direção e peso da matriz de votos, se for o estimador ───────
  //
  // **Uma matriz por casa, e isso é obrigatório, não preferência.** Um deputado
  // e um senador nunca votam na mesma votação nominal, então uma matriz com as
  // duas casas é bloco-diagonal e o primeiro componente dela é "em que casa
  // você senta". Groseclose, Levitt & Snyder (*APSR* 1999) já dizem que escalas
  // de scorecard esticam e deslocam entre casas; aqui seria pior que isso.
  const weigherByHouse = new Map<House, ItemWeigher>();
  const recoveryByHouse = new Map<House, Record<PositioningAxisKey, RecoveryDiagnostics>>();
  const droppedByHouse = new Map<House, number>();
  if (estimator === "pca") {
    const govByTerm = new Map(
      [...governismoByTerm].map(([term, byAgent]) => [
        term,
        new Map([...byAgent].map(([id, g]) => [id, g.score])),
      ]),
    );
    for (const house of [House.CAMARA, House.SENADO]) {
      const houseAgents = agents.filter((a) => agentHouse.get(a.id) === house);
      if (houseAgents.length === 0) continue;

      // Seleção de item para a matriz: votada nesta casa, classificada e que
      // dividiu. Independe de eixo — o componente decide sozinho de que eixo a
      // votação fala, e as tags entram depois, só para orientar a ponta.
      const themeIds = new Set<string>();
      for (const a of houseAgents) {
        for (const v of votesByAgent.get(a.id) ?? []) themeIds.add(v.themeId);
      }
      const matrixItems: RecoveryItem[] = [];
      const kidByTheme = new Map<string, string>();
      let droppedNonPolicy = 0;
      for (const themeId of themeIds) {
        const stats = statsByTheme.get(themeId);
        const theme = dimensionsByTheme.get(themeId);
        if (!stats || !theme?.dims.scoreable) continue;
        if (discrimination(stats) < MIN_DISCRIMINATION) continue;
        // Requerimento não é posição sobre mérito — ver `bill-types.ts`.
        if (policyItemsOnly && !theme.policy) {
          droppedNonPolicy++;
          continue;
        }
        if (weights === "clean") {
          if (stats.contamination === null || stats.contamination > maxContamination) continue;
        }
        matrixItems.push({ themeId, tagDirection: 0, term: termByTheme.get(themeId) ?? null });
        kidByTheme.set(themeId, theme.kid);
      }

      const matrixVotes: RecoveryVote[] = [];
      for (const a of houseAgents) {
        for (const v of votesByAgent.get(a.id) ?? []) {
          if (!kidByTheme.has(v.themeId)) continue;
          const sign = voteSign(v.value);
          if (sign === 0) continue;
          matrixVotes.push({ agentId: a.id, themeId: v.themeId, sign: sign as -1 | 1 });
        }
      }

      // PC1 → econômico, PC2 → social. Extrair "o componente principal" duas
      // vezes sobre a mesma matriz devolveria o mesmo vetor.
      const recovered = {} as Record<
        PositioningAxisKey,
        Map<string, { weight: number; direction: -1 | 1 }>
      >;
      const diagnostics = {} as Record<PositioningAxisKey, RecoveryDiagnostics>;
      for (const [skipComponents, axis] of AXIS_KEYS.entries()) {
        const oriented = matrixItems.map((it) => ({
          ...it,
          tagDirection: dimensionsByTheme.get(it.themeId)?.dims[axis]?.direction ?? 0,
        }));
        const result = recoverAxis(matrixVotes, oriented, govByTerm, {
          residualise,
          skipComponents,
        });
        // Rechaveado pelo kid, que é o que `ScorableVote.themeKey` carrega.
        const byKid = new Map<string, { weight: number; direction: -1 | 1 }>();
        for (const [themeId, item] of result.items) {
          const kid = kidByTheme.get(themeId);
          if (kid) byKid.set(kid, item);
        }
        recovered[axis] = byKid;
        diagnostics[axis] = result.diagnostics;
      }
      weigherByHouse.set(house, recoveredWeigher(recovered));
      recoveryByHouse.set(house, diagnostics);
      droppedByHouse.set(house, droppedNonPolicy);
    }
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

    const position = computePosition(scorable, {
      mode: weights,
      maxContamination,
      minEffectiveItems,
      weigher: weigherByHouse.get(house),
    });
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

  // ── Descontar o governismo dos escores, se for a medição pedida ───────────
  //
  // Antes de orientar, porque a orientação lê médias partidárias e elas mudam.
  if (estimator === "pca" && scoreResidual) {
    for (const house of [House.CAMARA, House.SENADO]) {
      const inHouse = scored.filter((s) => s.house === house);
      if (inHouse.length === 0) continue;
      for (const axis of AXIS_KEYS) {
        const rows = inHouse.map((s) => ({
          value: s.position[axis].value,
          covariate: s.governismo,
        }));
        const scorable = rows.filter(
          (r): r is { value: number; covariate: number | null } => r.value !== null,
        );
        if (scorable.length === 0) continue;
        const residuals = residualiseScores(scorable);
        let k = 0;
        for (const s of inHouse) {
          const reading = s.position[axis];
          if (reading.value === null) continue;
          // Preso à escala nomeada: um resíduo que passasse de 100 não é "mais
          // que Mercado", é extrapolação de uma reta fora do intervalo medido.
          reading.value = Math.max(-100, Math.min(100, Math.round(residuals[k++])));
        }
      }
    }
  }

  // ── Nomear as pontas de cada eixo recuperado ──────────────────────────────
  //
  // Depois de pontuar e antes das portas, porque orientar precisa das médias
  // partidárias e as portas precisam do eixo já orientado. Um passo, um lugar —
  // ver `orientAxis` para por que o bit vem da âncora e o que isso custa à
  // porta 4.
  const orientationByHouse = new Map<House, Record<AxisKey, { left: string[]; right: string[] }>>();
  if (estimator === "pca") {
    for (const house of [House.CAMARA, House.SENADO]) {
      const inHouse = scored.filter((s) => s.house === house);
      if (inHouse.length === 0) continue;
      const orientation = {} as Record<AxisKey, { left: string[]; right: string[] }>;
      for (const axis of AXIS_KEYS) {
        // **O eixo social não tem régua externa.** `anchors.ts` publica só
        // esquerda-direita (Bolognesi, BLS-9); não há GALTAN por partido
        // brasileiro ali. Orientar o PC2 por `anchorFor` seria nomear as pontas
        // de um eixo de costumes com uma régua econômica — e foi exatamente o
        // que a rodada de 24/08/2026 imprimiu, com polos idênticos nos dois
        // eixos.
        //
        // Um eixo que não pode ser orientado não pode ser publicado: das duas
        // pontas, nada diz qual é qual, e um sinal inventado é pior que nenhum
        // número. O PC2 continua existindo para a figura; o número sai.
        if (axis !== "economic") {
          for (const s of inHouse) s.position[axis].value = null;
          orientation[axis] = { left: [], right: [] };
          continue;
        }
        const byParty = new Map<string, number[]>();
        for (const s of inHouse) {
          const value = s.position[axis].value;
          if (value === null || !s.partyAcronym) continue;
          const list = byParty.get(s.partyAcronym) ?? [];
          list.push(value);
          byParty.set(s.partyAcronym, list);
        }
        const partyMeans = [...byParty].map(([acronym, values]) => ({
          acronym,
          mean: values.reduce((sum, v) => sum + v, 0) / values.length,
        }));
        const { flip, left, right } = orientAxis(partyMeans);
        if (flip === -1) {
          for (const s of inHouse) {
            const reading = s.position[axis];
            if (reading.value !== null) reading.value = -reading.value;
          }
        }
        orientation[axis] = { left, right };
      }
      orientationByHouse.set(house, orientation);
    }
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
    const BANDS = [0.1, 0.2, 0.3, 0.4, 0.5];
    const bandCounts = new Array<number>(BANDS.length).fill(0);
    let items = 0;
    let itemsControlled = 0;
    let itemsUncontrolled = 0;
    for (const themeId of houseThemeIds) {
      const stats = statsByTheme.get(themeId);
      const theme = dimensionsByTheme.get(themeId);
      if (!stats || !theme?.dims.scoreable) continue;
      if (discrimination(stats) < MIN_DISCRIMINATION) continue;

      if (stats.contamination === null) itemsUncontrolled++;
      else {
        itemsControlled++;
        for (let i = 0; i < BANDS.length; i++) {
          if (stats.contamination <= BANDS[i]) bandCounts[i]++;
        }
      }

      // Em `clean` o item acima do teto pesa zero, então contá-lo aqui faria a
      // porta 1 passar sobre itens que não carregam nada — o modo tem de ser
      // julgado pelo subconjunto que ele de fato usa.
      if (weights === "clean") {
        if (stats.contamination === null || stats.contamination > maxContamination) continue;
      }
      items++;
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
      anchorCorrelationAll: null,
      axisCorrelation: null,
      socialCollinear: false,
      contaminationBands: BANDS.map((maxContamination, i) => ({
        maxContamination,
        items: bandCounts[i],
      })),
      itemsUncontrolled,
      recovery: recoveryByHouse.get(house) ?? null,
      orientation: orientationByHouse.get(house) ?? null,
      droppedNonPolicy: droppedByHouse.get(house) ?? 0,
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
    // Todo partido ancorado entra, **pesado pela bancada**. Ver
    // `weightedSpearman`: excluir bancada fina foi tentado, custou nas duas
    // rodadas da Câmara e bloqueou o Senado inteiro por deixar a dispersão sem
    // pares. Pesar contém o mesmo ruído sem jogar fora a informação, e não
    // precisa de limiar.
    const anchorPairs: Array<{ a: number; b: number; w: number }> = [];
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
        w: values.length,
      });
    }
    report.unanchored = unanchored.sort();
    report.anchorCoverage = withReading.length > 0 ? anchoredSeats / withReading.length : 0;
    report.anchorCorrelation = weightedSpearman(anchorPairs);
    // Sem peso, ao lado: é o número que diz quanto do resultado vem da
    // ponderação, e sem ele a ponderação seria indistinguível de escolha.
    report.anchorCorrelationAll = spearman(anchorPairs);

    // Dispersão contra a régua, sobre exatamente os pares que a porta 3 usa.
    const ourSd = stdDev(anchorPairs.map((p) => p.a));
    const anchorSd = stdDev(anchorPairs.map((p) => p.b * 100));
    report.spreadRatio =
      ourSd !== null && anchorSd !== null && anchorSd > 0 ? ourSd / anchorSd : null;

    // ── Julgamento, na ordem em que as portas se fecham ─────────────────────
    const signal = report.recovery?.economic.signalRatio ?? null;
    if (items < MIN_HOUSE_ITEMS) {
      report.blocked = { kind: "items", items };
    } else if (withReading.length < MIN_HOUSE_AGENTS) {
      report.blocked = { kind: "agents", agents: withReading.length };
    } else if (signal !== null && signal < MIN_SIGNAL_RATIO) {
      // Antes de tudo o que pressupõe sinal. Um componente indistinguível de
      // ruído ainda produz ordenação, dispersão e correlação — e todas as três
      // seriam leituras de matriz aleatória.
      report.blocked = { kind: "noise", ratio: signal };
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
    minEffectiveItems,
    estimator,
    scoreResidual,
    policyItemsOnly,
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
async function computeGovernismo(): Promise<
  Map<string, Map<string, { score: number; base: number }>>
> {
  const rollCalls = await db.rollCall.findMany({
    where: { governmentPosition: { not: null } },
    select: { id: true, governmentPosition: true, occurredAt: true },
  });
  if (rollCalls.length === 0) return new Map();

  const orientation = new Map(
    rollCalls.map((r) => [r.id, { want: r.governmentPosition, term: termOf(r.occurredAt) }]),
  );
  const rollCallVotes = await db.rollCallVote.findMany({
    where: { rollCallId: { in: rollCalls.map((r) => r.id) } },
    select: { agentId: true, rollCallId: true, value: true },
  });

  const tally = new Map<string, { with: number; total: number }>();
  for (const v of rollCallVotes) {
    const meta = orientation.get(v.rollCallId);
    if (!meta?.want || !meta.term) continue;
    const key = `${meta.term}:${v.agentId}`;
    const bucket = tally.get(key) ?? { with: 0, total: 0 };
    bucket.total++;
    if (v.value === meta.want) bucket.with++;
    tally.set(key, bucket);
  }

  const out = new Map<string, Map<string, { score: number; base: number }>>();
  for (const [key, b] of tally) {
    if (b.total < MIN_GOVERNISMO_OPPORTUNITIES) continue;
    const split = key.indexOf(":");
    const term = key.slice(0, split);
    const agentId = key.slice(split + 1);
    const byAgent = out.get(term) ?? new Map<string, { score: number; base: number }>();
    // O denominador viaja junto com a razão: a leitura não é publicável sem ele.
    byAgent.set(agentId, { score: Math.round((b.with / b.total) * 100), base: b.total });
    out.set(term, byAgent);
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
  // **Recortado ao mandato corrente**, por duas razões que apontam para o mesmo
  // lugar. A de conteúdo: coesão é uma propriedade da bancada de agora, e uma
  // média sobre sete anos misturaria duas legislaturas e as trocas de partido
  // entre elas. A de escala: sem `where`, isto lia a tabela inteira de
  // `RollCallVote` para a memória — algo em torno de um milhão de linhas depois
  // do backfill de 2019, contra ~80 mil antes.
  const rows = await db.rollCallVote.findMany({
    where: { rollCall: { occurredAt: { gte: currentTermStart() } } },
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
    case "noise":
      return (
        `o componente recuperado está a ${block.ratio.toFixed(2)}× o piso de ruído ` +
        `(mínimo ${MIN_SIGNAL_RATIO}×) — indistinguível de matriz aleatória do mesmo formato`
      );
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
