/**
 * Índice de Posicionamento (CLAUDE.md §3.2) — onde uma trajetória de votos cai
 * em dois eixos de valor.
 *
 * Reconstruído contra a literatura de escalonamento de votações nominais, de
 * *voting advice applications* e de indicadores compostos. O que existia antes
 * era uma média ponderada de `voto × peso do tema` normalizada pela soma dos
 * pesos — aritmeticamente idêntica ao teste aberto **8values**, que publica o
 * código e nenhum método. Quatro defeitos a derrubaram, e cada um deles é
 * endereçado aqui por uma peça nomeada:
 *
 * ── 1. Ausência de dado lida como centro ───────────────────────────────────
 *
 * `ecoW === 0` produzia `economic: 0`, que é exatamente a coordenada de um
 * centrista perfeito. Um agente sem nenhum tema classificado era publicado como
 * moderado. Essa é a regressão registrada no §11 ("PL no Centro"): não era um
 * erro de pesos, era dado faltando impresso como medida. Aqui a cobertura é
 * medida (`effectiveItems`) e abaixo do piso o eixo é **`null`** — a mesma
 * disciplina que `qualityScore` já aplica, pelo mesmo motivo.
 *
 * ── 2. Todo tema pesava igual, inclusive os que não dividiram ninguém ───────
 *
 * Em TRI, o peso de um item é seu parâmetro de **discriminação** — e ele é
 * mensurável, não adivinhável. Uma votação em que 97% da casa votou junto não
 * separa ninguém, mas movia a média como qualquer outra. `discrimination()`
 * mede a divisão real e um item unânime passa a valer zero. É também o que
 * neutraliza a composição da pauta: uma sequência de projetos aprovados por
 * aclamação não empurra mais a casa inteira para o polo em que foram marcados.
 *
 * ── 3. O eixo 1 de votação nominal no Brasil não é ideologia ────────────────
 *
 * Zucco & Lauderdale (*LSQ* 36(3), 2011) mostram que a primeira dimensão
 * recuperada das votações da Câmara é **governo↔oposição**, não esquerda↔direita
 * — e que ela passou a explicar mais do comportamento legislativo do que a
 * ideológica. Medido sobre 87 votações nominais de 2024–2025, o primeiro
 * componente principal correlaciona **−0,96 com governismo e +0,49** com a
 * escala do *Brazilian Legislative Survey*, e coloca o PSOL em 14º de 18, à
 * direita do PSDB — porque o PSOL se opõe ao governo pela esquerda.
 *
 * Isso **não** se corrige classificando melhor os temas: o sinal de coalizão
 * está nos votos, não nas ementas. Duas peças o enfrentam. `contamination`
 * desconta a pauta do Executivo item a item (a Câmara publica a orientação do
 * bloco `Governo` em `/votacoes/{id}/orientacoes`), e o teste de falseamento em
 * `src/lib/integration/positioning.ts` correlaciona o resultado final com o
 * governismo de cada agente: passando do limiar, **nada é publicado**. Um índice
 * de governismo com rótulo de ideologia é o erro que a literatura documenta, e
 * ele é silencioso por construção.
 *
 * ── 4. O colapso 0,7·econômico + 0,3·social era invenção ────────────────────
 *
 * Não havia fonte para esses pesos. O RILE pesa seus dois lados igualmente; o
 * CHES se recusa a colapsar e publica LRECON e GALTAN como escalas separadas. O
 * colapso saiu daqui: o índice tem dois eixos e os publica como dois. Se algum
 * dia um número único for publicado, ele terá de ser **ajustado** contra uma
 * referência externa (`src/lib/domain/anchors.ts`), nunca afirmado.
 *
 * Puro: sem banco, sem cache, sem relógio. A camada de consulta está em
 * `src/lib/domain/positions.ts` e o lote em `src/lib/integration/positioning.ts`.
 */

import type { VoteValue } from "@/generated/prisma";

// ─── Eixos ───────────────────────────────────────────────────────────────────

/**
 * Os dois eixos, com a definição do **Chapel Hill Expert Survey** — a
 * operacionalização mais cuidadosamente redigida em circulação, e a que torna o
 * resultado daqui conferível contra uma medida externa.
 *
 * O eixo social mudou de rótulo, não de sinal. Ele era `Comunidade ↔ Indivíduo`,
 * e "Comunidade" convida a codificar comunitarismo — uma terceira coisa, que não
 * correlaciona com nenhum dos polos que o eixo realmente mede. O conteúdo sempre
 * foi GAL-TAN: de um lado ordem, tradição e autoridade moral; do outro liberdade
 * pessoal e autonomia. As tags já gravadas continuam válidas porque o sinal não
 * se moveu — apenas o nome do polo negativo.
 */
export const POSITIONING_AXES = {
  economic: {
    key: "economic",
    label: "Eixo econômico",
    negative: "Estado",
    positive: "Mercado",
    /** CHES LRECON, traduzido. */
    definition:
      "Privatização, impostos, regulação, gasto público e previdência. O polo Estado quer o poder público atuando na economia; o polo Mercado quer esse papel reduzido.",
  },
  social: {
    key: "social",
    label: "Eixo social",
    negative: "Ordem",
    positive: "Liberdades",
    /** CHES GALTAN, traduzido. */
    definition:
      "Liberdades pessoais — aborto, união homoafetiva, drogas — de um lado; ordem, tradição e autoridade moral do Estado sobre condutas, do outro.",
  },
} as const;

export type AxisKey = keyof typeof POSITIONING_AXES;
export const AXIS_KEYS = ["economic", "social"] as const satisfies readonly AxisKey[];

// ─── A classificação de um tema ──────────────────────────────────────────────

/**
 * Motivos pelos quais uma proposição sai do índice.
 *
 * Todos **mecânicos**. Essa é a diferença entre o Votto e um *scorecard* de
 * grupo de interesse: a partir do momento em que um comitê humano escolhe quais
 * projetos contam, a plataforma passa a ter uma ideologia — o Ranking dos
 * Políticos é honesto ao declarar a sua, e o Votto não pode declarar nenhuma. A
 * defesa é censo com filtro mecânico, não curadoria.
 *
 * Snyder (*LSQ* 17(3), 1992) mostrou o preço da seleção: escolher só votações
 * divisivas fabrica bimodalidade, e o *scorecard* passa a medir a escolha do
 * comitê. Aqui a escolha é uma regra publicada, aplicável por qualquer um.
 */
export type ExclusionReason =
  /** Homenagem, data comemorativa, denominação de via ou prédio. */
  | "honorific"
  /** Requerimento, urgência, destaque, redação final — o voto não é sobre o mérito. */
  | "procedural"
  /** Interesse estritamente local, sem conteúdo de política nacional. */
  | "local"
  /** Peça orçamentária sem conteúdo de política. */
  | "budget"
  /** Administrativo ou técnico: existe, mas não carrega os eixos. */
  | "apolitical"
  /** O classificador não chegou a um sinal confiável. Vai para revisão humana. */
  | "ambiguous";

/**
 * Como um tema carrega um eixo.
 *
 * **Direção e magnitude são campos separados de propósito.** O sinal é um
 * julgamento nominal de três classes, cuja confiabilidade se mede com o alfa de
 * Krippendorff; a magnitude é um julgamento intervalar que ninguém codifica de
 * forma reproduzível. Mikhaylov, Laver & Benoit (*Political Analysis* 20(1),
 * 2012) mediram exatamente isso no Manifesto Project e concluíram que a
 * classificação fina é sistematicamente malfeita mesmo por codificadores
 * treinados. Guardar `0.3` num campo só apagava a diferença entre "levemente
 * pró-mercado" e "possivelmente pró-mercado", que são fatos diferentes.
 */
export interface AxisTag {
  /** −1, 0 ou +1: para onde um voto SIM empurra. Zero = o eixo não é tocado. */
  direction: -1 | 0 | 1;
  /** 0..1 — quanto. Default 1 quando ninguém mediu: a direção é o que se afirma. */
  magnitude: number;
  /** 0..1 — confiança do classificador nesse eixo. Entra no peso. */
  confidence: number;
}

/** A classificação completa de um tema, versionada. */
export interface ThemeDimensions {
  /** Versão do formato. Ausente = formato 1 (dois números soltos). */
  version: number;
  /** Falso quando o tema não entra no índice. */
  scoreable: boolean;
  reason: ExclusionReason | null;
  economic: AxisTag | null;
  social: AxisTag | null;
  /** 0..1 — centralidade da proposição no debate nacional. Não entra no peso. */
  salience: number;
  /** Uma frase: o que um voto SIM faz acontecer. */
  yesMeans: string | null;
  /** Trecho da ementa que justifica o sinal. É o que torna a tag defensável. */
  evidence: string | null;
  /** Verdadeiro quando a tag veio do formato antigo e ainda não foi reclassificada. */
  legacy: boolean;
}

const clamp01 = (n: unknown): number => {
  const v = Number(n);
  return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0;
};

const clampUnit = (n: unknown): number => {
  const v = Number(n);
  return Number.isFinite(v) ? Math.max(-1, Math.min(1, v)) : 0;
};

function parseAxisTag(value: unknown): AxisTag | null {
  if (value === null || value === undefined) return null;

  // Formato 2: objeto com direção, magnitude e confiança.
  if (typeof value === "object") {
    const v = value as Record<string, unknown>;
    const raw = Number(v.direction);
    if (!Number.isFinite(raw)) return null;
    const direction = (raw > 0 ? 1 : raw < 0 ? -1 : 0) as -1 | 0 | 1;
    if (direction === 0) return null; // Um eixo não tocado é ausência, não zero.
    return {
      direction,
      magnitude: v.magnitude === undefined ? 1 : clamp01(v.magnitude),
      confidence: v.confidence === undefined ? 1 : clamp01(v.confidence),
    };
  }

  // Formato 1: um número solto em −1..1, direção e magnitude fundidas.
  const n = clampUnit(value);
  if (n === 0) return null;
  return { direction: n > 0 ? 1 : -1, magnitude: Math.abs(n), confidence: 1 };
}

/**
 * Ler a coluna `Theme.dimensions`, em qualquer um dos dois formatos.
 *
 * Defensiva de propósito: a coluna é JSON escrito por versões anteriores do
 * classificador, e uma tag antiga tem de degradar para "medida mais grosseira",
 * nunca derrubar uma página pública. Tags do formato 1 saem marcadas
 * `legacy: true` para que `npm run reposition` possa dizer que fatia do índice
 * ainda repousa sobre elas.
 */
export function parseDimensions(value: unknown): ThemeDimensions {
  const empty: ThemeDimensions = {
    version: 0,
    scoreable: false,
    reason: null,
    economic: null,
    social: null,
    salience: 0,
    yesMeans: null,
    evidence: null,
    legacy: false,
  };
  if (!value || typeof value !== "object" || Array.isArray(value)) return empty;

  const v = value as Record<string, unknown>;
  const version = Number(v.version) || 1;
  const economic = parseAxisTag(v.economic);
  const social = parseAxisTag(v.social);

  if (version < 2) {
    return {
      ...empty,
      version: 1,
      // O formato 1 não tinha exclusões: um tema com algum eixo marcado contava.
      scoreable: Boolean(economic || social),
      economic,
      social,
      legacy: true,
    };
  }

  const reason = typeof v.reason === "string" ? (v.reason as ExclusionReason) : null;
  return {
    version,
    scoreable: v.scoreable !== false && reason === null && Boolean(economic || social),
    reason,
    economic,
    social,
    salience: clamp01(v.salience),
    yesMeans: typeof v.yesMeans === "string" ? v.yesMeans : null,
    evidence: typeof v.evidence === "string" ? v.evidence : null,
    legacy: false,
  };
}

// ─── Estatística do item ─────────────────────────────────────────────────────

/**
 * O que a casa fez com uma proposição — o que transforma uma tag num peso.
 *
 * Medido sobre os votos dos agentes, nunca sobre os dos cidadãos: é a divisão do
 * plenário que diz se aquela votação separou alguém.
 */
export interface ItemStats {
  /** Votos SIM de parlamentares. */
  yes: number;
  /** Votos NÃO de parlamentares. */
  no: number;
  /**
   * 0..1 — quanto a votação foi decidida ao longo da linha governo↔oposição.
   *
   * `null` quando não se sabe (a orientação do bloco Governo não foi importada
   * para aquela sessão). Não é zero: "não medido" e "não contaminado" são
   * afirmações diferentes, e confundi-las é o que faria o índice publicar um
   * governismo rotulado de ideologia sem nenhum aviso.
   */
  contamination: number | null;
}

/**
 * Discriminação de um item: `2·min(sim,não)/(sim+não)`.
 *
 * Zero numa votação unânime, um numa dividida ao meio. É o parâmetro de
 * discriminação da TRI reduzido ao que se pode medir sem ajustar um modelo — e é
 * o que impede que a **composição da pauta** vire posição: uma sequência de
 * projetos aprovados por aclamação e marcados no mesmo polo empurrava, antes,
 * a casa inteira para lá.
 *
 * Ela também é a razão para separar este índice do de alinhamento. Concordar com
 * um consenso continua sendo concordância, então o alinhamento mantém as
 * votações unânimes; posicionamento é sobre o que separa as pessoas, e uma
 * votação sem linha de corte não separa ninguém.
 */
export function discrimination(stats: ItemStats): number {
  const cast = stats.yes + stats.no;
  if (cast === 0) return 0;
  return (2 * Math.min(stats.yes, stats.no)) / cast;
}

/**
 * Abaixo desta discriminação a votação é tratada como unânime e sai da conta.
 *
 * 0,20 corresponde a um placar de 90/10 — o ponto em que a literatura de
 * *scorecards* considera que a votação deixou de carregar informação. Medido na
 * Câmara de 2025, 25% das votações nominais estão nessa faixa.
 */
export const MIN_DISCRIMINATION = 0.2;

/**
 * Como a contaminação governista entra no peso de um item.
 *
 * `discount` é a metodologia **publicada** (`POSITIONING_METHODOLOGY`): o item
 * é multiplicado por `(1 − contaminação)`. `raw` é um modo de **medição**, que
 * remove esse fator e nada mais.
 *
 * `raw` existe por causa de um defeito medido, não por gosto de configuração.
 * Os dois fatores são anticorrelacionados no Brasil: uma votação que **divide**
 * a casa é quase por definição uma votação governo↔oposição, então `(1 − c)`
 * esvazia justamente os itens que carregam informação, enquanto
 * `MIN_DISCRIMINATION` zera o resto. Medido na Câmara em 24/08/2026, com 217
 * itens e 458 deputados com leitura: as médias partidárias couberam em **15
 * pontos** (PSOL −9 … PP +6) contra ~160 da régua externa — dispersão de **9%**,
 * com o mínimo em 40%.
 *
 * O que `raw` mede é qual metade do defeito é o desconto. A dispersão é de
 * escala; a âncora (ρ = 0,63) é de **ordenação**, e Spearman é livre de escala
 * — devolver amplitude não move ρ por si só. Rodar os dois modos lado a lado
 * separa "o desconto destruiu a variância" de "as tags apontam errado", que
 * levam a trabalhos completamente diferentes (§11).
 *
 * **`raw` nunca é publicável.** Não é uma metodologia alternativa — é a
 * ausência de um controle cujo teste de falseamento (`MAX_GOVERNMENT_CORRELATION`)
 * existe precisamente porque a coalizão contamina o eixo. `recomputePositioningIndex`
 * recusa a gravar sob qualquer modo que não seja `discount`, e adotar outro
 * exigiria `version`, `changedAt` e fingerprint novos.
 */
export type WeightMode = "discount" | "raw";

/** O modo da metodologia em vigor. Todo caller que não pede nada recebe este. */
export const DEFAULT_WEIGHT_MODE: WeightMode = "discount";

/**
 * Peso de um item para um eixo: discriminação × (1 − contaminação) × confiança ×
 * magnitude.
 *
 * Quatro coisas distintas, multiplicadas porque qualquer uma delas sendo zero
 * torna o item inútil: uma votação unânime, uma decidida pela coalizão, uma tag
 * em que o classificador não confia, e um tema que não toca o eixo.
 *
 * `mode` só governa o segundo fator, e só existe para medição — veja
 * `WeightMode`. Os outros três valem nos dois modos: em `raw` uma votação
 * unânime continua valendo zero, porque o que ela não faz é separar pessoas, e
 * isso não tem nada a ver com a coalizão.
 */
export function itemWeight(
  tag: AxisTag,
  stats: ItemStats,
  mode: WeightMode = DEFAULT_WEIGHT_MODE,
): number {
  const d = discrimination(stats);
  if (d < MIN_DISCRIMINATION) return 0;
  // Contaminação desconhecida não é contaminação zero — mas descartar o item
  // aqui esvaziaria o índice inteiro antes de a orientação ser importada. O
  // item entra, e quem recusa a publicação é o teste de falseamento do lote,
  // que sabe quantos itens ficaram sem controle.
  const c = mode === "raw" ? 0 : (stats.contamination ?? 0);
  return d * (1 - c) * tag.confidence * tag.magnitude;
}

// ─── Posição de uma pessoa ───────────────────────────────────────────────────

/** Um voto pronto para entrar na conta. */
export interface ScorableVote {
  value: VoteValue;
  dimensions: ThemeDimensions;
  stats: ItemStats;
  /** Identificador do tema, para o diagnóstico de item mais influente. */
  themeKey: string;
}

/** Leitura de um eixo para uma pessoa. */
export interface AxisReading {
  /** −100..100, ou `null` quando a cobertura não alcança o piso. */
  value: number | null;
  /** Erro padrão na mesma escala, ou `null` junto com o valor. */
  standardError: number | null;
  /** Itens que contribuíram, contados de cabeça. */
  items: number;
  /** Soma dos pesos — a cobertura que o piso compara. */
  effectiveItems: number;
  /**
   * Maior deslocamento causado por uma única proposição, e qual.
   *
   * O handbook OECD/JRC torna a análise de sensibilidade obrigatória, e este é o
   * recorte que interessa a um cidadão: se um projeto sozinho move o número em
   * quinze pontos, o número é um relatório sobre aquele projeto e o leitor tem
   * direito de saber qual.
   */
  influence: { themeKey: string; delta: number } | null;
}

export interface Position {
  economic: AxisReading;
  social: AxisReading;
  /** Fatia dos itens usados que ainda vem do formato de tag antigo, 0..1. */
  legacyShare: number;
}

/**
 * Piso de cobertura por eixo, em **peso efetivo** — não em contagem de votos.
 *
 * A distinção é a razão de o piso existir: oito votações unânimes somam peso
 * quase nulo e não deveriam habilitar leitura nenhuma, enquanto oito votações
 * disputadas e bem classificadas somam quase oito. O piso mede o segundo caso.
 *
 * **Oito**, e o número vem de uma analogia com escala: um *scorecard* da ADA usa
 * vinte votações escolhidas a dedo, e vinte votações reais descontadas pela
 * divisão média do plenário e pela confiança das tags somam algo em torno de
 * oito unidades de peso. Na prática, portanto, o piso pede da ordem de **vinte
 * proposições classificadas e disputadas** por eixo.
 *
 * Este é o número a recalibrar primeiro contra o histograma real (§11): ele
 * decide se um eixo é publicado ou fica `null`, e um piso baixo demais devolve o
 * defeito que a reconstrução inteira existe para fechar — uma posição publicada
 * sobre quase nada.
 */
export const MIN_EFFECTIVE_ITEMS = 8;

/**
 * Votações classificadas e divididas de que uma **casa** precisa para ser
 * escalada, contra o piso acima, que é por pessoa.
 *
 * Vinte é a convenção do `wnominate` para o mínimo de votos de um único
 * parlamentar, e usá-la como piso da casa inteira é conservador de propósito.
 * Medido nas fontes: a Câmara produz de 40 a 60 votações nominais substantivas
 * por ano; o Senado publicou 14 em dezoito meses — a porta que exclui o Senado
 * é esta, e ela é mecânica, sem nomear a casa.
 */
export const MIN_HOUSE_ITEMS = 20;

/**
 * Votações com orientação do bloco `Governo` de que um agente precisa antes de
 * ter governismo medido.
 *
 * Abaixo de dez a razão oscila dezenas de pontos por uma única sessão. Isso já
 * importava quando o governismo era só o controle do índice — um controle
 * ruidoso barra casas por acidente —, e importa mais agora que ele é publicado:
 * a afirmação é sobre uma pessoa nomeada.
 */
export const MIN_GOVERNISMO_OPPORTUNITIES = 10;

/** Agentes medidos de que uma casa precisa antes de a correlação significar algo. */
export const MIN_HOUSE_AGENTS = 30;

const EMPTY_AXIS: AxisReading = {
  value: null,
  standardError: null,
  items: 0,
  effectiveItems: 0,
  influence: null,
};

function voteSign(v: VoteValue): number {
  return v === "YES" ? 1 : v === "NO" ? -1 : 0;
}

/** Média ponderada de contribuições em −1..1, ou `null` sem cobertura. */
function weightedMean(contributions: Array<{ w: number; s: number }>): number | null {
  let sw = 0;
  let sws = 0;
  for (const c of contributions) {
    sw += c.w;
    sws += c.w * c.s;
  }
  return sw > 0 ? sws / sw : null;
}

/** Uma leitura de eixo a partir das contribuições já pesadas. */
function readAxis(
  contributions: Array<{ w: number; s: number; themeKey: string }>,
): AxisReading {
  const used = contributions.filter((c) => c.w > 0);
  const effectiveItems = used.reduce((sum, c) => sum + c.w, 0);
  if (used.length === 0 || effectiveItems < MIN_EFFECTIVE_ITEMS) {
    return { ...EMPTY_AXIS, items: used.length, effectiveItems };
  }

  const mean = weightedMean(used) ?? 0;

  // Erro padrão de uma média ponderada, pela contagem efetiva de Kish. Com pesos
  // iguais reduz ao familiar `s/√n`; com pesos desiguais reconhece que um item
  // que pesa dez vezes mais não são dez observações.
  const sumW = effectiveItems;
  const sumW2 = used.reduce((sum, c) => sum + c.w * c.w, 0);
  const kish = sumW2 > 0 ? (sumW * sumW) / sumW2 : 0;
  const variance =
    kish > 1
      ? used.reduce((sum, c) => sum + c.w * (c.s - mean) ** 2, 0) / sumW / (kish - 1)
      : null;
  const standardError = variance !== null && variance >= 0 ? Math.sqrt(variance) : null;

  // Deixa-um-projeto-de-fora: o item cuja remoção mais desloca a leitura.
  let influence: AxisReading["influence"] = null;
  if (used.length > 1) {
    for (const dropped of used) {
      const without = weightedMean(used.filter((c) => c !== dropped));
      if (without === null) continue;
      const delta = Math.abs(without - mean) * 100;
      if (!influence || delta > influence.delta) {
        influence = { themeKey: dropped.themeKey, delta: Math.round(delta * 10) / 10 };
      }
    }
  }

  return {
    value: Math.round(mean * 100),
    standardError: standardError === null ? null : Math.round(standardError * 100),
    items: used.length,
    effectiveItems: Math.round(effectiveItems * 100) / 100,
    influence,
  };
}

/**
 * Posição de uma pessoa a partir dos seus votos.
 *
 * Pura, e a mesma função para cidadão e para parlamentar — mas note que os
 * **pesos vêm da casa**, não de quem está sendo medido. Isso não é detalhe de
 * implementação: Jessee (*AJPS* 60(4), 2016) mostrou que estimar cidadãos e
 * parlamentares num modelo conjunto faz a posição publicada de cada parlamentar
 * depender da razão entre cidadãos e parlamentares na base — quer dizer, da taxa
 * de cadastro da plataforma. A posição de um deputado mudaria porque o Votto
 * ganhou usuários. Aqui o espaço é definido pelas votações da casa e congelado;
 * o cidadão é projetado dentro dele, e nada que ele vote move ninguém.
 */
export function computePosition(
  votes: ScorableVote[],
  mode: WeightMode = DEFAULT_WEIGHT_MODE,
): Position {
  const byAxis: Record<AxisKey, Array<{ w: number; s: number; themeKey: string }>> = {
    economic: [],
    social: [],
  };
  let legacyUsed = 0;
  let totalUsed = 0;

  for (const vote of votes) {
    const sign = voteSign(vote.value);
    // Abstenção não move nada. É a regra de todo VAA sério para o lado do
    // usuário — e do lado do parlamentar ela é ainda mais clara: abstenção e
    // obstrução são manobras regimentais, não posições sobre o mérito.
    if (sign === 0) continue;
    if (!vote.dimensions.scoreable) continue;

    let contributed = false;
    for (const axis of AXIS_KEYS) {
      const tag = vote.dimensions[axis];
      if (!tag) continue;
      const w = itemWeight(tag, vote.stats, mode);
      if (w <= 0) continue;
      byAxis[axis].push({ w, s: sign * tag.direction, themeKey: vote.themeKey });
      contributed = true;
    }
    if (contributed) {
      totalUsed++;
      if (vote.dimensions.legacy) legacyUsed++;
    }
  }

  return {
    economic: readAxis(byAxis.economic),
    social: readAxis(byAxis.social),
    legacyShare: totalUsed > 0 ? legacyUsed / totalUsed : 0,
  };
}

/**
 * Edição da metodologia, carimbada em toda leitura gravada.
 *
 * Mesma convenção do índice de qualidade, e pelo mesmo motivo: um número que
 * muda porque a pessoa mudou e um número que muda porque o método mudou são
 * fatos diferentes, e sem o carimbo a página não tem como distinguir os dois.
 *
 * **Suba `version` e `changedAt` a qualquer mudança nos pesos, nos pisos, na
 * definição dos eixos ou nas portas de validação.**
 */
export const POSITIONING_METHODOLOGY = {
  version: "2026.1",
  changedAt: "2026-08-23",
  /** Uma linha, mostrada ao lado da leitura. */
  summary:
    "Dois eixos do CHES, itens pesados por discriminação, pauta do Executivo descontada, validado contra o BLS-9.",
} as const;

// ─── Faixas do espectro ──────────────────────────────────────────────────────

/**
 * As cinco faixas, da esquerda para a direita.
 *
 * **Nenhuma delas é publicada hoje, e as portas abaixo são a condição para que
 * voltem a ser** (§3.2). O conjunto de produtos que batiza uma faixa —
 * 8values, Political Compass, IDRlabs — é exatamente o conjunto que não publica
 * método; Wahl-O-Mat, StemWijzer, smartvote e Vote Compass publicam número
 * contínuo e ordem, e nenhum deles nomeia categoria.
 *
 * E há o precedente de governança: o Reino Unido aboliu a nota-título única do
 * Ofsted em setembro de 2024 — "reductive", "low information for parents and
 * high stakes for schools" — depois de um inquérito ligar o processo à morte de
 * uma diretora. Quatro subnotas substituíram a palavra única. É o precedente
 * mais próximo do que uma faixa faria aqui.
 */
export const SPECTRUM_BANDS = [
  { key: "esquerda", label: "Esquerda", from: -100, to: -50 },
  { key: "centro-esquerda", label: "Centro esquerda", from: -50, to: -15 },
  { key: "centro", label: "Centro", from: -15, to: 15 },
  { key: "centro-direita", label: "Centro direita", from: 15, to: 50 },
  { key: "direita", label: "Direita", from: 50, to: 100 },
] as const;

/** Mapear um escore −100..100 na faixa correspondente. */
export function deriveBand(spectrum: number): { key: string; label: string } {
  const band =
    SPECTRUM_BANDS.find((b) => spectrum >= b.from && spectrum < b.to) ??
    SPECTRUM_BANDS[SPECTRUM_BANDS.length - 1];
  return { key: band.key, label: band.label };
}

/** Por que uma faixa não pôde ser impressa. */
export type BandBlock =
  /** Cobertura abaixo do piso. */
  | "coverage"
  /** O intervalo de 95% atravessa um corte: a faixa seria cara ou coroa. */
  | "separation"
  /** O índice ainda não passou na validação contra a âncora externa. */
  | "unvalidated";

/**
 * Se uma leitura pode virar faixa, e por que não.
 *
 * A porta que faz o trabalho é `separation`. Com cinco faixas sobre −100..100,
 * cada uma tem 40 pontos de largura, então um intervalo de 95% que não caiba
 * dentro de uma delas significa que o rótulo é decidido por ruído. É a mesma
 * ideia do "não separa" de Goldstein & Spiegelhalter sobre tabelas de liga:
 * *"about two thirds of all possible comparisons do not allow separation."*
 *
 * `validated` é passado pelo lote, não medido aqui: é uma propriedade do índice
 * inteiro, não desta pessoa.
 */
export function bandGate(
  reading: AxisReading,
  validated: boolean,
): { band: { key: string; label: string } | null; blocked: BandBlock | null } {
  if (reading.value === null) return { band: null, blocked: "coverage" };
  if (!validated) return { band: null, blocked: "unvalidated" };

  const se = reading.standardError;
  if (se === null) return { band: null, blocked: "separation" };
  const low = deriveBand(Math.max(-100, reading.value - 1.96 * se));
  const high = deriveBand(Math.min(100, reading.value + 1.96 * se));
  if (low.key !== high.key) return { band: null, blocked: "separation" };

  return { band: low, blocked: null };
}
