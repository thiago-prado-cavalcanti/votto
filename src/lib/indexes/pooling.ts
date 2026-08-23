/**
 * Agregação parcial — como um partido recebe a leitura dos seus parlamentares.
 *
 * Um partido não é uma pessoa e não vota; tudo o que se pode dizer dele vem dos
 * seus membros. A pergunta é qual estatística usar, e a resposta depende de que
 * grandeza se está afirmando. São três, e elas não são a mesma:
 *
 *  1. **o partido como ator** — o que ele faria se agisse como um só. Existe um
 *     θ latente e os membros são leituras ruidosas dele;
 *  2. **a tendência central de quem hoje ocupa as cadeiras** — uma estatística
 *     descritiva de uma população finita, em que a média *é* a resposta;
 *  3. **o partido que o leitor vai encontrar na próxima votação** — preditiva.
 *
 * O Votto publica "o quanto este partido está alinhado com você", que é (1) ou
 * (3). Só isso licencia o encolhimento aplicado aqui, e é o primeiro passo do
 * handbook OECD/JRC — o que costuma ser pulado.
 *
 * ── Por que encolher ────────────────────────────────────────────────────────
 *
 * As bancadas vão de 1 a 90. A média simples de uma bancada de um publica a
 * excentricidade de uma pessoa como a posição de um partido: medida crua em −80,
 * com erro padrão de 40, ela é indistinguível da média da casa. O estimador aqui
 * é o de dois níveis — meta-análise de efeitos aleatórios embaixo, encolhimento
 * empírico-bayesiano em cima:
 *
 *     yᵢ  ~ N(μᵢ, vᵢ)        vᵢ = variância amostral do próprio membro
 *     μᵢ  ~ N(θⱼ, ψ²)        ψ  = dispersão real dentro do partido
 *     θⱼ  ~ N(μ,  τ²)        τ  = espalhamento entre partidos
 *
 * A forma implementável é a média bayesiana conhecida do IMDb — e é a frase que
 * a página de metodologia carrega:
 *
 *     θ̂ⱼ = (nⱼ·ȳⱼ + m·μ) / (nⱼ + m),      m = σ²/τ²
 *
 * *todo partido é pontuado como se tivesse mais `m` membros parados na média da
 * casa; uma bancada de noventa mal os sente, uma de um é quase só eles.* A
 * diferença para o IMDb é que ali `m` é escolhido e aqui é **estimado dos
 * dados**.
 *
 * ── O problema Clemente, e por que existe um limitador ──────────────────────
 *
 * Encolher minimiza o erro *total* maltratando sistematicamente o indivíduo
 * genuinamente extremo. Efron mostra isso na própria série que popularizou o
 * método: James–Stein ganha no agregado e **perde para a média simples em 4 dos
 * 18 jogadores**, perdendo feio no caso de Roberto Clemente — o melhor rebatedor
 * do grupo, puxado para a média porque a média é onde quase todo mundo está.
 *
 * Aqui os extremos genuínos são exatamente os partidos cuja posição é notícia.
 * Por isso o encolhimento vem com o limitador de Efron & Morris (*limited
 * translation*): o deslocamento nunca passa de um erro padrão da média
 * observada. Isso limita a injustiça máxima cometida contra um partido nomeado a
 * uma grandeza que dá para escrever na página.
 */

/** Uma leitura individual que entra numa média de grupo. */
export interface Member<T = unknown> {
  /** Escore do membro, na escala publicada. */
  value: number;
  /** Erro padrão do escore do membro. */
  standardError: number;
  /** Carga útil devolvida ao chamador (id, nome, o que for). */
  payload?: T;
}

/** Variância de amostragem de um membro, com piso para não dividir por zero. */
function memberVariance(m: Member, floor: number): number {
  const v = m.standardError * m.standardError;
  return Number.isFinite(v) && v > 0 ? v : floor;
}

/**
 * Estimador de momentos de DerSimonian–Laird para a variância entre unidades.
 *
 * `τ̂² = max(0, (Q − (k−1)) / C)`, com `Q` a estatística de heterogeneidade
 * ponderada pela precisão e `C` o fator de escala. Aritmética pura, uma passada,
 * sem biblioteca — que é a condição para isto rodar num job em TypeScript.
 */
export function betweenVariance(members: Member[], varianceFloor: number): number {
  const k = members.length;
  if (k < 2) return 0;

  let sumU = 0;
  let sumU2 = 0;
  let sumUY = 0;
  for (const m of members) {
    const u = 1 / memberVariance(m, varianceFloor);
    sumU += u;
    sumU2 += u * u;
    sumUY += u * m.value;
  }
  if (sumU === 0) return 0;

  const fixedMean = sumUY / sumU;
  let q = 0;
  for (const m of members) {
    const u = 1 / memberVariance(m, varianceFloor);
    q += u * (m.value - fixedMean) ** 2;
  }
  const c = sumU - sumU2 / sumU;
  if (c <= 0) return 0;
  return Math.max(0, (q - (k - 1)) / c);
}

/** O que se sabe de um grupo depois de agregar. */
export interface PooledEstimate<T = unknown> {
  /** A leitura publicada, já encolhida e limitada. */
  value: number;
  /** A média observada, antes de encolher. Publicada ao lado, sempre. */
  observed: number;
  /** Erro padrão da média observada. */
  standardError: number;
  /**
   * Confiabilidade `B = τ²/(τ² + Var(ȳ))`, 0..1.
   *
   * A fração do desvio do grupo em relação à casa que é sinal e não ruído. Perto
   * de 1 a média do grupo é publicada quase como está; perto de 0 o grupo é
   * publicado como aproximadamente médio, porque é isso que de fato se sabe.
   */
  reliability: number;
  /** Quantos membros entraram. */
  members: number;
  /**
   * Dispersão real dentro do grupo, com o erro de medição já descontado.
   *
   * Não é o desvio-padrão cru dos escores: aquele soma discordância verdadeira
   * com ruído de amostragem, e faz qualquer bancada que contenha um membro
   * recém-empossado parecer dividida.
   */
  dispersion: number;
  /** Os membros, em ordem de escore — o que a tira de dispersão desenha. */
  spread: Array<{ value: number; payload?: T }>;
}

/**
 * Média de grupo com encolhimento parcial e translação limitada.
 *
 * @param members    leituras individuais, cada uma com seu erro padrão
 * @param grandMean  média da casa, o alvo do encolhimento
 * @param tau2       variância entre grupos, de {@link betweenVariance}
 * @param opts.cap   quantos erros padrão o encolhimento pode deslocar (Efron &
 *                   Morris; 1 é o valor que "mitiga o problema Clemente
 *                   mantendo quase toda a vantagem do encolhimento")
 */
export function pool<T>(
  members: Array<Member<T>>,
  grandMean: number,
  tau2: number,
  opts: { cap?: number; varianceFloor?: number } = {},
): PooledEstimate<T> | null {
  if (members.length === 0) return null;
  const cap = opts.cap ?? 1;
  const varianceFloor = opts.varianceFloor ?? 1;

  // Dispersão interna, pelo mesmo estimador de momentos usado um nível acima.
  const psi2 = betweenVariance(members, varianceFloor);

  // Média ponderada pela precisão: `wᵢ = 1/(ψ² + vᵢ)`. É o que resolve, sem
  // exclusão nenhuma, o parlamentar empossado no mês passado — o erro padrão
  // dele é grande, então o peso é pequeno. Excluir seria uma escolha a defender;
  // pesar não é.
  let sumW = 0;
  let sumWY = 0;
  for (const m of members) {
    const w = 1 / (psi2 + memberVariance(m, varianceFloor));
    sumW += w;
    sumWY += w * m.value;
  }
  const observed = sumW > 0 ? sumWY / sumW : members[0].value;
  const varObserved = sumW > 0 ? 1 / sumW : varianceFloor;
  const seObserved = Math.sqrt(varObserved);

  const reliability = tau2 > 0 ? tau2 / (tau2 + varObserved) : 0;
  const shrunk = grandMean + reliability * (observed - grandMean);

  // Translação limitada: o encolhimento nunca move a leitura mais que `cap`
  // erros padrão da média observada.
  const value = Math.min(
    Math.max(shrunk, observed - cap * seObserved),
    observed + cap * seObserved,
  );

  return {
    value: Math.round(value),
    observed: Math.round(observed),
    standardError: Math.round(seObserved),
    reliability: Math.round(reliability * 100) / 100,
    members: members.length,
    dispersion: Math.round(Math.sqrt(psi2)),
    spread: [...members]
      .sort((a, b) => a.value - b.value)
      .map((m) => ({ value: Math.round(m.value), payload: m.payload })),
  };
}

// ─── Coesão ──────────────────────────────────────────────────────────────────

/** Contagem de uma bancada numa votação. */
export interface Tally {
  yes: number;
  no: number;
  abstention: number;
}

/**
 * Índice de Concordância de Hix, Noury & Roland (*BJPS* 35(1), 2005).
 *
 *     AI = [ max{S,N,A} − ½·((S+N+A) − max{S,N,A}) ] / (S+N+A)
 *
 * **Não é o índice de Rice**, e a diferença importa porque os votos aqui são
 * sim/não/abstenção. Rice é `|S−N|/(S+N)` e simplesmente **ignora a abstenção**:
 * uma bancada que se abstém em bloco — 10 sim, 10 não, 100 abstenções — marca
 * 0,000 em Rice, "completamente dividida", contra 0,750 no AI. Abstenção em
 * bloco é disciplina partidária exibida, não colapso, e ler ao contrário é ler o
 * oposto do que aconteceu.
 */
export function agreementIndex(t: Tally): number | null {
  const total = t.yes + t.no + t.abstention;
  if (total === 0) return null;
  const top = Math.max(t.yes, t.no, t.abstention);
  return (top - 0.5 * (total - top)) / total;
}

/**
 * Valor esperado do índice de concordância sob voto aleatório, para uma bancada
 * de `n`.
 *
 * Isto existe porque **coesão crua é enviesada pelo tamanho da bancada**, e o
 * viés é grande: sob moeda honesta pura, uma bancada de 2 marca 0,50 e uma de 90
 * marca 0,08. Publicar coesão sem corrigir produziria um ranking de "partidos
 * mais coesos do Brasil" cuja ordenação é, na prática, o inverso do tamanho —
 * exatamente o artefato que Desposato (*BJPS* 35, 2005) mostrou ter sido
 * confundido com substância na literatura sobre a Constituinte brasileira.
 *
 * Somatório binomial exato, memoizado por `n`: são no máximo 90 termos.
 *
 * **Cuidado ao conferir contra a literatura.** Os valores tabelados por aí são
 * do índice de **Rice**, não deste. Sem abstenções as duas escalas são a mesma
 * reta — `AI = 0,75·Rice + 0,25` —, então a tabela de Rice sob voto aleatório
 * (0,500 para n=2; 0,084 para n=90) corresponde a **0,625 e 0,313** aqui. Quem
 * comparar direto vai achar que a função está errada; ela não está.
 */
const randomAiCache = new Map<number, number>();
export function expectedRandomAgreement(n: number): number {
  if (n <= 1) return 1;
  const cached = randomAiCache.get(n);
  if (cached !== undefined) return cached;

  // P(k sim | n) binomial(0,5), com o resto em não. Abstenção não é modelada:
  // o nulo é "a bancada joga cara ou coroa entre sim e não".
  let logC = 0; // log C(n,0) = 0
  let sum = 0;
  for (let k = 0; k <= n; k++) {
    if (k > 0) logC += Math.log((n - k + 1) / k);
    const p = Math.exp(logC - n * Math.LN2);
    const top = Math.max(k, n - k);
    sum += p * ((top - 0.5 * (n - top)) / n);
  }
  randomAiCache.set(n, sum);
  return sum;
}

/**
 * Coesão em excesso sobre o acaso, 0..1 — o número comparável entre bancadas de
 * tamanhos diferentes.
 *
 *     (AI_observado − E[AI | n]) / (1 − E[AI | n])
 *
 * `null` para bancada de um, onde a coesão é 1 por construção e não informa
 * nada.
 */
export function excessCohesion(observed: number, n: number): number | null {
  if (n <= 1) return null;
  const expected = expectedRandomAgreement(n);
  if (expected >= 1) return null;
  return Math.max(0, Math.min(1, (observed - expected) / (1 - expected)));
}
