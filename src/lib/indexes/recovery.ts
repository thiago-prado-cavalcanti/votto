/**
 * Recuperar a direção e o peso de cada votação **da própria matriz de votos**,
 * em vez de perguntar a um classificador.
 *
 * ── Por que este módulo existe ───────────────────────────────────────────────
 *
 * O estimador de §3.2 é uma média ponderada de `voto × tag.direction`, com o
 * peso vindo da tag. Medido na Câmara em 24/08/2026, ele não funciona, e a
 * medição foi conclusiva em três rodadas (§11):
 *
 *  - `raw` desligou o desconto de contaminação. O governismo foi de −0,19 a
 *    −0,42 — os pesos mudaram de verdade — e a dispersão não saiu de 9%.
 *    **Ponderar não era o defeito.**
 *  - `clean` ficou só com os 35 itens que a coalizão não conduziu. A dispersão
 *    subiu para 26–35% (a compressão *era* o cancelamento dos contaminados),
 *    mas a âncora desabou para **ρ = 0,27**, abaixo do 0,63 do conjunto inteiro.
 *    **Selecionar item não era o conserto.**
 *  - E o par que fecha o diagnóstico: nesse subconjunto limpo o **PT lê à
 *    direita do PL** — +13 contra +12 com n = 61 e 91, +15 contra +11 com
 *    n = 34 e 49 —, onde o BLS os coloca em −69 e +49. Duas bancadas de dezenas
 *    de membros, polos opostos, votando de forma indistinguível *em relação às
 *    direções que etiquetamos*. Nenhum tamanho de amostra explica isso:
 *    `tag.direction` não se alinha com o modo como a casa vota.
 *
 * O sinal, por outro lado, **está nos votos**: `docs/posicionamento.md` mede
 * PCA não-supervisionada nas votações sem orientação do governo em **ρ = +0,917**
 * contra o BLS, acima da nossa barra de 0,85, enquanto o estimador com 217 itens
 * etiquetados devolve 0,69. Dois números sobre itens quase iguais, na mesma
 * casa; a diferença é o estimador.
 *
 * ── O que ele troca, e o que deliberadamente NÃO troca ───────────────────────
 *
 * Só a origem de duas coisas: **para que lado a votação aponta** e **quanto ela
 * pesa**. Hoje vêm de `tag.direction` e `tag.confidence × tag.magnitude`; aqui
 * vêm do primeiro componente principal. Depois disso o pipeline é o mesmo —
 * mesma média ponderada, mesmo erro padrão de Kish, mesmo `MIN_EFFECTIVE_ITEMS`,
 * mesmas quatro portas. Isso é escolha de projeto e não economia de esforço:
 * mantém a mudança falseável pelas mesmas réguas que reprovaram a anterior, e
 * deixa a escala cair sozinha em −100..100, porque a conta continua sendo uma
 * média de ±1. Um estimador que precisasse de constante de escala inventada
 * poderia passar na porta 3 por escolha de multiplicador, o que não é passar.
 *
 * As tags perdem o papel de medir e ficam com o de **orientar**: qual ponta do
 * eixo é "Mercado". É exatamente o papel que Zucco & Lauderdale dão a rótulos —
 * e é por isso que o estimador é robusto a tag ruim. Errar a direção de itens
 * individuais deixa de deslocar a leitura; só a soma dos sinais decide a ponta,
 * e para isso basta que as tags acertem na média.
 *
 * ── O primeiro componente é governismo, e é por isso que residualizamos ──────
 *
 * Zucco & Lauderdale (*LSQ* 36(3), 2011) e Izumi (*Dados* 59(1), 2016): a
 * primeira dimensão das votações nominais brasileiras é governo↔oposição, não
 * ideologia. Medido aqui: o PC1 sobre 87 votações correlaciona **−0,96 com o
 * governismo** e só +0,49 com o BLS. Rodar PCA crua e chamar o PC1 de eixo
 * econômico seria publicar governismo com outro nome — o erro que a porta 2
 * existe para pegar.
 *
 * Então cada coluna é **residualizada contra o governismo** antes da
 * decomposição: de cada votação sai a parte que o apoio ao Executivo explica, e
 * o componente é extraído do que resta. É a residualização que o §11 pedia,
 * agora no lugar certo — na **matriz**, não nos escores. A diferença importa e é
 * aritmética: residualizar escores multiplica a variância por (1 − r²), ou seja
 * *encolhe* a leitura; residualizar colunas e então extrair o componente
 * dominante do resíduo preserva a variância que sobra e a concentra num eixo.
 *
 * O custo está anotado em `RecoveryOptions.residualise`: com o resíduo
 * ortogonal ao governismo por construção, a porta 2 mede ~0 e deixa de testar.
 * Quem valida passa a ser a âncora externa, e é por isso que `--residual=off`
 * existe — a porta 2 continua significando algo sobre o eixo não residualizado.
 */

/** Um voto de parlamentar já reduzido ao que a decomposição usa. */
export interface RecoveryVote {
  agentId: string;
  themeId: string;
  /** +1 para SIM, −1 para NÃO. Abstenção não entra: não é posição. */
  sign: -1 | 1;
}

/** Uma votação candidata, com a tag que servirá apenas para orientar o eixo. */
export interface RecoveryItem {
  themeId: string;
  /** Direção etiquetada, ou 0 quando o eixo não é tocado. Só orienta. */
  tagDirection: -1 | 0 | 1;
}

export interface RecoveryOptions {
  /**
   * Descontar de cada coluna a parte que o governismo explica, antes de
   * decompor. **Ligado é o correto** — sem isso o componente extraído é a
   * clivagem governo↔oposição, que é a primeira dimensão das votações
   * brasileiras e não é ideologia.
   *
   * O preço: o resíduo é ortogonal ao governismo por construção, então a porta
   * de falseamento passa a medir ~0 e para de testar. Desligar serve para medir
   * o eixo cru e ver a porta 2 dizer algo.
   */
  residualise?: boolean;
  /** Iterações da iteração de potência. 100 converge com folga nesta escala. */
  iterations?: number;
  /**
   * Quantos componentes deflacionar antes de extrair este.
   *
   * `0` devolve o primeiro, `1` o segundo. É assim que os dois eixos saem
   * diferentes: extrair "o componente principal" duas vezes sobre a mesma
   * matriz devolveria o mesmo vetor, e os eixos econômico e social seriam
   * idênticos com dois rótulos.
   *
   * Deflacionar é subtrair da matriz o que o componente anterior já explica,
   * então o seguinte é o mais forte do que resta e é ortogonal ao primeiro por
   * construção. Note a consequência para `MAX_AXIS_CORRELATION`: com PC1 e PC2
   * a correlação entre os eixos é ~0 **por construção**, e não porque o Brasil
   * separe as duas dimensões. Aquela porta mede algo sob o estimador de tags e
   * não mede nada aqui.
   */
  skipComponents?: number;
}

/** O que a decomposição descobriu sobre uma votação. */
export interface RecoveredItem {
  /** 0..1 — quanto a votação separa a casa ao longo do eixo. Substitui o peso da tag. */
  weight: number;
  /** Para que lado um SIM empurra, segundo os votos. Substitui `tag.direction`. */
  direction: -1 | 1;
}

export interface RecoveryDiagnostics {
  /** Agentes e votações que entraram na matriz. */
  agents: number;
  items: number;
  /** Fatia da variância da matriz capturada pelo componente. */
  explained: number;
  /**
   * Concordância entre os sinais recuperados e os etiquetados, sobre os itens
   * com tag, em −1..1.
   *
   * É o número que diz o que a rodada anterior deixou implícito. Perto de 1 as
   * tags e os votos concordam e o estimador antigo falhou por peso; perto de 0
   * as tags são ruído, e é aí que a troca de estimador ganha o que ganha. O
   * sinal em si não informa — a orientação já foi resolvida por ele.
   */
  tagAgreement: number;
  /** Quantos itens com tag sustentaram a orientação. */
  oriented: number;
  /** Verdadeiro quando não havia tag alguma e a ponta do eixo é arbitrária. */
  unoriented: boolean;
}

export interface RecoveryResult {
  items: Map<string, RecoveredItem>;
  diagnostics: RecoveryDiagnostics;
}

/** Média de uma lista, ou 0 quando vazia. */
function mean(xs: number[]): number {
  return xs.length === 0 ? 0 : xs.reduce((s, x) => s + x, 0) / xs.length;
}

/**
 * Recuperar peso e direção de cada votação a partir de quem votou como.
 *
 * A matriz é agentes × votações, com +1/−1 onde houve voto e **0 onde não
 * houve**. Zero é a média da coluna depois da centralização, então ausência
 * entra como "sem informação" e não como posição intermediária — que é o
 * tratamento certo: quem não votou não votou no meio.
 *
 * `governismo` é opcional por agente; quem não tem não participa da
 * residualização daquela coluna, mas continua na decomposição.
 */
export function recoverAxis(
  votes: RecoveryVote[],
  items: RecoveryItem[],
  governismo: Map<string, number>,
  opts: RecoveryOptions = {},
): RecoveryResult {
  const residualise = opts.residualise ?? true;
  const iterations = opts.iterations ?? 100;
  const skip = opts.skipComponents ?? 0;

  const itemIndex = new Map(items.map((it, j) => [it.themeId, j]));
  const agentIds = [...new Set(votes.map((v) => v.agentId))];
  const agentIndex = new Map(agentIds.map((id, i) => [id, i]));
  const N = agentIds.length;
  const M = items.length;

  const empty: RecoveryResult = {
    items: new Map(),
    diagnostics: {
      agents: N,
      items: M,
      explained: 0,
      tagAgreement: 0,
      oriented: 0,
      unoriented: true,
    },
  };
  if (N === 0 || M === 0) return empty;

  // ── A matriz, em vetor único por coluna ───────────────────────────────────
  // `present` é separado de `x` porque 0 é um valor legítimo depois de
  // centralizar: sem essa máscara, "votou e ficou na média" e "não votou"
  // seriam indistinguíveis, e a residualização trataria ausência como dado.
  const x: Float64Array[] = Array.from({ length: M }, () => new Float64Array(N));
  const present: Uint8Array[] = Array.from({ length: M }, () => new Uint8Array(N));
  for (const v of votes) {
    const j = itemIndex.get(v.themeId);
    const i = agentIndex.get(v.agentId);
    if (j === undefined || i === undefined) continue;
    x[j][i] = v.sign;
    present[j][i] = 1;
  }

  // ── Centralizar cada coluna sobre quem votou nela ─────────────────────────
  for (let j = 0; j < M; j++) {
    let sum = 0;
    let n = 0;
    for (let i = 0; i < N; i++) if (present[j][i]) { sum += x[j][i]; n++; }
    if (n === 0) continue;
    const mu = sum / n;
    for (let i = 0; i < N; i++) x[j][i] = present[j][i] ? x[j][i] - mu : 0;
  }

  // ── Residualizar contra o governismo, coluna por coluna ───────────────────
  if (residualise) {
    const g = new Float64Array(N);
    const hasG = new Uint8Array(N);
    const gs: number[] = [];
    for (const [id, score] of governismo) {
      const i = agentIndex.get(id);
      if (i === undefined) continue;
      g[i] = score;
      hasG[i] = 1;
      gs.push(score);
    }
    const gMean = mean(gs);
    for (let i = 0; i < N; i++) g[i] = hasG[i] ? g[i] - gMean : 0;

    for (let j = 0; j < M; j++) {
      let num = 0;
      let den = 0;
      for (let i = 0; i < N; i++) {
        if (!present[j][i] || !hasG[i]) continue;
        num += x[j][i] * g[i];
        den += g[i] * g[i];
      }
      if (den <= 0) continue;
      const b = num / den;
      for (let i = 0; i < N; i++) {
        if (!present[j][i] || !hasG[i]) continue;
        x[j][i] -= b * g[i];
      }
    }
  }

  // A variância total é medida ANTES de qualquer deflação: `explained` tem de
  // responder "que fatia da matriz este eixo carrega", e comparar o PC2 com o
  // que restou depois de tirar o PC1 daria a ele um denominador menor — o
  // segundo eixo pareceria mais forte que o primeiro.
  let totalSS = 0;
  for (let j = 0; j < M; j++) for (let i = 0; i < N; i++) totalSS += x[j][i] * x[j][i];

  // ── Iteração de potência sobre XᵀX, com deflação dos anteriores ───────────
  const seed = new Float64Array(M);
  let seeded = false;
  for (let j = 0; j < M; j++) {
    if (items[j].tagDirection !== 0) { seed[j] = items[j].tagDirection; seeded = true; }
  }
  if (!seeded) for (let j = 0; j < M; j++) seed[j] = 1;

  // Anotado, e não inferido: `power` devolve `Float64Array<ArrayBufferLike>` e
  // `new Float64Array` é `<ArrayBuffer>`, que é o mais estreito dos dois.
  let w: Float64Array = new Float64Array(M);
  let componentSS = 0;
  for (let k = 0; k <= skip; k++) {
    w = power(x, seed, N, M, iterations);
    const s = project(x, w, N, M);
    componentSS = 0;
    for (let i = 0; i < N; i++) componentSS += s[i] * s[i];
    // Deflação: tira da matriz o que este componente explica, para o próximo
    // laço encontrar o mais forte do que resta.
    if (k < skip) {
      for (let j = 0; j < M; j++) {
        const wj = w[j];
        if (wj === 0) continue;
        const col = x[j];
        for (let i = 0; i < N; i++) col[i] -= s[i] * wj;
      }
    }
  }
  const explained = totalSS > 0 ? Math.min(1, componentSS / totalSS) : 0;

  // ── Orientar pelas tags ───────────────────────────────────────────────────
  // A soma dos produtos decide a ponta. Um item etiquetado ao contrário não
  // desloca a leitura de ninguém: ele apenas deixa de contribuir para esta
  // soma. É toda a robustez do estimador, e ela é local a estas quatro linhas.
  let agree = 0;
  let oriented = 0;
  let normW = 0;
  for (let j = 0; j < M; j++) {
    normW += Math.abs(w[j]);
    if (items[j].tagDirection === 0) continue;
    oriented++;
    agree += Math.sign(w[j]) * items[j].tagDirection;
  }
  const tagAgreement = oriented > 0 ? agree / oriented : 0;
  const flip = tagAgreement < 0 ? -1 : 1;

  // ── Peso e direção por item ───────────────────────────────────────────────
  // Normalizado pelo máximo e não pela soma: o peso tem de continuar
  // comparável ao da tag (0..1, com `MIN_EFFECTIVE_ITEMS` medido nessa escala),
  // e uma normalização pela soma faria o piso de cobertura depender de quantas
  // votações a casa produziu.
  let maxAbs = 0;
  for (let j = 0; j < M; j++) maxAbs = Math.max(maxAbs, Math.abs(w[j]));
  const out = new Map<string, RecoveredItem>();
  if (maxAbs > 0) {
    for (let j = 0; j < M; j++) {
      const loading = w[j] * flip;
      out.set(items[j].themeId, {
        weight: Math.abs(loading) / maxAbs,
        direction: loading < 0 ? -1 : 1,
      });
    }
  }

  return {
    items: out,
    diagnostics: {
      agents: N,
      items: M,
      explained,
      tagAgreement,
      oriented,
      unoriented: oriented === 0 || normW === 0,
    },
  };
}

/**
 * O componente dominante de X, por iteração de potência sobre XᵀX sem formar XᵀX.
 *
 * A semente é a direção etiquetada, não um vetor aleatório. Converge para o
 * mesmo componente de qualquer forma, mas chega nele com um sinal reproduzível —
 * `Math.random()` faria duas execuções sobre os mesmos dados publicarem eixos
 * espelhados.
 */
function power(
  x: Float64Array[],
  seed: Float64Array,
  N: number,
  M: number,
  iterations: number,
): Float64Array {
  let w = new Float64Array(M);
  w.set(seed);
  if (normalise(w) === 0) return new Float64Array(M);
  for (let iter = 0; iter < iterations; iter++) {
    const s = project(x, w, N, M);
    const next = new Float64Array(M);
    for (let j = 0; j < M; j++) {
      const col = x[j];
      let acc = 0;
      for (let i = 0; i < N; i++) acc += col[i] * s[i];
      next[j] = acc;
    }
    if (normalise(next) === 0) break;
    w = next;
  }
  return w;
}

/** X·w — a posição de cada agente ao longo do componente. */
function project(x: Float64Array[], w: Float64Array, N: number, M: number): Float64Array {
  const s = new Float64Array(N);
  for (let j = 0; j < M; j++) {
    const wj = w[j];
    if (wj === 0) continue;
    const col = x[j];
    for (let i = 0; i < N; i++) s[i] += col[i] * wj;
  }
  return s;
}

/** Normalizar em L2 no lugar. Devolve a norma anterior, 0 se degenerado. */
function normalise(v: Float64Array): number {
  let ss = 0;
  for (let i = 0; i < v.length; i++) ss += v[i] * v[i];
  const norm = Math.sqrt(ss);
  if (!Number.isFinite(norm) || norm === 0) return 0;
  for (let i = 0; i < v.length; i++) v[i] /= norm;
  return norm;
}
