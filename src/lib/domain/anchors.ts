/**
 * Âncoras externas — o que impede o índice de posicionamento de medir a si mesmo.
 *
 * Um índice construído a partir de votos, validado contra os mesmos votos, não é
 * validado: é circular. Jackson & Kingdon (*AJPS* 36, 1992) fizeram essa
 * objeção aos *scorecards* americanos e ela nunca foi respondida. A saída é
 * confrontar o resultado com uma medida construída por outro método, por outras
 * pessoas, antes de existirmos — e no Brasil essa medida existe.
 *
 * ── Duas âncoras, e por que duas ────────────────────────────────────────────
 *
 * **Bolognesi et al. (2022)** é a primária: 515 cientistas políticos filiados à
 * ABCP posicionando 32 partidos. **BLS-9** (Power & Zucco) é a secundária:
 * parlamentares federais, sob anonimato, posicionando os partidos numa escala de
 * 1 a 10, com correção à la Aldrich–McKelvey para o fato de que "5" não
 * significa a mesma coisa para um deputado do PSOL e um do PL.
 *
 * Duas porque uma régua sozinha é uma régua, e duas que concordam a 0,979 são
 * uma checagem. Elas também erram de formas diferentes — uma é julgamento de
 * acadêmicos sobre partidos, a outra é julgamento de pares dentro do Congresso —
 * e ainda assim chegam à mesma ordenação. É esse acordo que dá direito de tratar
 * a ordenação como fato externo e não como opinião de um grupo.
 *
 * ── Por que tabelas no código, e não um import ──────────────────────────────
 *
 * São números que não mudam: uma onda de survey publicada é um documento
 * fechado. Um job de importação para lê-los seria uma dependência de rede numa
 * checagem que precisa rodar exatamente igual toda vez, inclusive quando a fonte
 * estiver fora do ar. Os valores estão aqui com a citação ao lado, e conferi-los
 * é abrir o apêndice.
 *
 * ── O que fazer com um partido que não está nas tabelas ─────────────────────
 *
 * **Nada.** Partidos sem âncora simplesmente não entram na correlação, e a
 * cobertura que sobrou é reportada junto do resultado.
 *
 * A tentação é interpolar. O PRD é a fusão de PTB (+0,544) e Patriota (+0,720),
 * então "+0,63" parece inofensivo — mas um valor inventado dentro da régua que
 * valida o índice é a última coisa que pode existir aqui: ele passaria a validar
 * a interpolação. (UNIÃO já foi este exemplo, quando só havia a âncora do BLS;
 * hoje Bolognesi o publica diretamente, em +0,698, o que é precisamente o
 * argumento a favor de buscar mais uma fonte em vez de estimar a que falta.)
 */

/**
 * **A âncora primária:** Bolognesi, Ribeiro, Codato & Silva (2025), onda de 2022
 * — 515 cientistas políticos filiados à ABCP posicionando **32 partidos** numa
 * reta de 0 a 10, reescalada aqui para −1..+1 por `(x − 5) / 5`.
 *
 * Escolhida à frente do BLS por três motivos, e nenhum deles é preferência:
 *
 *  - **Cobre a legislatura atual.** UNIÃO, AVANTE e as siglas nascidas das
 *    fusões de 2022 existem aqui e não existem no BLS-9, que é de 2021. Sem
 *    elas, a régua deixava de fora justamente as maiores bancadas da Câmara.
 *  - **É brasileira e replicada.** Duas ondas independentes, 2018 e 2022, sem
 *    sobreposição de respondentes, com microdados abertos no Harvard Dataverse
 *    (doi:10.7910/DVN/MFIXKW). Correlação entre as duas ondas: 0,978.
 *  - **Os especialistas viram uma reta sem números.** Deliberado, para que não
 *    ancorassem nos rótulos que já conhecem.
 *
 * A concordância entre as medidas brasileiras de survey é notável — Bolognesi,
 * BLS, PREPPS, V-Party e a Global Party Survey correlacionam entre si de **0,947
 * a 0,988**. A única família fora desse consenso é a de análise de manifestos
 * (ρ entre 0,13 e 0,36 no Brasil), o que é um aviso e não uma curiosidade: sob o
 * RILE cru, **um único dos 16 documentos brasileiros analisados cai à direita, e
 * o partido do regime militar pontua −15,1**. O RILE conta "Liberdades e Direitos
 * Humanos", "Constitucionalismo" e "Democracia" como direita, o que num sistema
 * pós-transição — onde todo partido escreve sobre democracia — inverte o sinal.
 * Importar essa intuição para a classificação dos temas é um dos caminhos
 * plausíveis para o PL ter lido como Centro.
 *
 * **O centro está vazio, e isso é achado publicado, não defeito.** Na onda de
 * 2018 três partidos ocupavam a faixa 4,5–5,5; em 2022 a faixa não tem ninguém, e
 * o maior vão da reta vai de 4,12 (PV) a 6,01 (Solidariedade).
 */
export const BOLOGNESI_2022_LEFT_RIGHT: Readonly<Record<string, number>> = {
  PSTU: -0.898,
  PCO: -0.89,
  PCB: -0.862,
  PSOL: -0.718,
  UP: -0.674,
  PCDOB: -0.644,
  PT: -0.464,
  PSB: -0.282,
  REDE: -0.262,
  PDT: -0.228,
  PV: -0.176,
  SOLIDARIEDADE: 0.202,
  CIDADANIA: 0.234,
  AVANTE: 0.294,
  MDB: 0.3,
  PMN: 0.348,
  PSDB: 0.352,
  PSD: 0.388,
  PODE: 0.488,
  PROS: 0.49,
  PRTB: 0.498,
  PTB: 0.544,
  PP: 0.63,
  DC: 0.642,
  REPUBLICANOS: 0.666,
  PSC: 0.682,
  UNIAO: 0.698,
  PATRIOTA: 0.72,
  NOVO: 0.734,
  PL: 0.76,
};

/**
 * Posições partidárias na escala esquerda↔direita do BLS, onda 9 (2021),
 * reescalada para −1..+1. Zucco & Power, *Latin American Politics and Society*
 * 66(1), Tabela C1. Erros padrão publicados entre 0,037 e 0,10.
 *
 * **Âncora secundária.** Mantida porque mede a mesma população que o Votto mede
 * — parlamentares federais em exercício — e porque uma régua só é uma régua; duas
 * que concordam a 0,979 são uma checagem. É a onda que Zucco & Lauderdale usam
 * para separar ideologia de governismo nas votações da Câmara.
 *
 * Chave: a sigla como o Votto a armazena em `Party.acronym`.
 */
export const BLS9_LEFT_RIGHT: Readonly<Record<string, number>> = {
  PSOL: -0.874,
  PCDOB: -0.822,
  PT: -0.691,
  REDE: -0.555, // onda de 2017; a de 2021 não traz REDE
  PSB: -0.427,
  PDT: -0.356,
  CIDADANIA: -0.014,
  PROS: 0.032,
  MDB: 0.137,
  PSDB: 0.157,
  SOLIDARIEDADE: 0.19,
  PSD: 0.296,
  PODE: 0.386,
  DEM: 0.431,
  PTB: 0.455,
  PL: 0.493,
  PP: 0.51,
  REPUBLICANOS: 0.55,
  PSC: 0.596,
  NOVO: 0.711,
  PSL: 0.803,
};

/**
 * Siglas da 57ª legislatura sem âncora publicada, e por quê.
 *
 * Listadas explicitamente para que `npm run reposition` possa dizer *quanto* da
 * casa ficou fora da validação. Uma correlação calculada sobre dez partidos que
 * cobrem 30% das cadeiras é um número diferente de uma sobre dezoito que cobrem
 * 90%, e a página tem de saber qual dos dois está imprimindo.
 */
export const UNANCHORED_PARTIES: Readonly<Record<string, string>> = {
  PRD: "fusão PTB+Patriota de 2023, posterior às duas ondas",
};

/** Normalizar uma sigla para bater com a tabela (acentos, caixa, pontuação). */
export function anchorKey(acronym: string | null | undefined): string {
  return (acronym ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z]/g, "")
    .toUpperCase();
}

/** Posição de âncora de um partido, ou `null` quando ele não tem uma. */
export function anchorFor(acronym: string | null | undefined): number | null {
  const key = anchorKey(acronym);
  if (!key) return null;
  const primary = BOLOGNESI_2022_LEFT_RIGHT as Record<string, number>;
  const secondary = BLS9_LEFT_RIGHT as Record<string, number>;
  return primary[key] ?? secondary[key] ?? null;
}

/** As duas âncoras lado a lado, para o relatório de calibragem. */
export function anchorsFor(acronym: string | null | undefined): {
  bolognesi: number | null;
  bls: number | null;
} {
  const key = anchorKey(acronym);
  return {
    bolognesi: (BOLOGNESI_2022_LEFT_RIGHT as Record<string, number>)[key] ?? null,
    bls: (BLS9_LEFT_RIGHT as Record<string, number>)[key] ?? null,
  };
}

/**
 * Correlação de postos de Spearman entre a leitura do índice e a âncora.
 *
 * Postos, e não Pearson, porque a afirmação que interessa é de **ordenação** —
 * "o índice põe os partidos na ordem que a literatura põe" — e porque as duas
 * escalas não têm por que ser lineares uma na outra. Empates recebem o posto
 * médio.
 */
export function spearman(pairs: Array<{ a: number; b: number }>): number | null {
  const n = pairs.length;
  if (n < 3) return null;

  const rank = (values: number[]): number[] => {
    const order = values.map((v, i) => ({ v, i })).sort((x, y) => x.v - y.v);
    const ranks = new Array<number>(n);
    let i = 0;
    while (i < n) {
      let j = i;
      while (j + 1 < n && order[j + 1].v === order[i].v) j++;
      const mid = (i + j) / 2 + 1;
      for (let k = i; k <= j; k++) ranks[order[k].i] = mid;
      i = j + 1;
    }
    return ranks;
  };

  const ra = rank(pairs.map((p) => p.a));
  const rb = rank(pairs.map((p) => p.b));
  const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
  const ma = mean(ra);
  const mb = mean(rb);

  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < n; i++) {
    num += (ra[i] - ma) * (rb[i] - mb);
    da += (ra[i] - ma) ** 2;
    db += (rb[i] - mb) ** 2;
  }
  if (da === 0 || db === 0) return null;
  return num / Math.sqrt(da * db);
}

/** Correlação de Pearson, para o teste de falseamento contra o governismo. */
export function pearson(pairs: Array<{ a: number; b: number }>): number | null {
  const n = pairs.length;
  if (n < 3) return null;
  const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / n;
  const as = pairs.map((p) => p.a);
  const bs = pairs.map((p) => p.b);
  const ma = mean(as);
  const mb = mean(bs);
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < n; i++) {
    num += (as[i] - ma) * (bs[i] - mb);
    da += (as[i] - ma) ** 2;
    db += (bs[i] - mb) ** 2;
  }
  if (da === 0 || db === 0) return null;
  return num / Math.sqrt(da * db);
}

/**
 * As duas portas que decidem se o índice pode ser publicado como ideologia.
 *
 * `MIN_ANCHOR_CORRELATION` — a ordenação partidária do eixo econômico tem de
 * bater com a das réguas de survey. **0,85, e o número tem uma razão empírica
 * desconfortável.**
 *
 * A tentação é achar que 0,70 bastaria — a rotação ancorada medida sobre dados
 * reais alcançou 0,86 fora da amostra, então algo abaixo disso pareceria um piso
 * modesto. O problema é o que *já* clareia essa barra. Medido sobre as votações
 * nominais brasileiras, o **governismo partidário puro** — a fração de vezes que
 * a bancada votou com o bloco Governo, sem nenhuma ideia de ideologia dentro —
 * correlaciona com a âncora do Bolognesi a **+0,93 sob Bolsonaro e −0,81 sob
 * Lula**. Ou seja: um índice que mede exclusivamente apoio ao Executivo tira
 * entre 0,81 e 0,93 no teste da âncora, e **teria passado** num limiar de 0,70.
 *
 * A colinearidade não é acidente: no presidencialismo de coalizão brasileiro a
 * base é ordenada ideologicamente, então dentro de *uma* presidência governismo e
 * ideologia quase não se distinguem. O que os separa é a troca de presidente, em
 * que o sinal inverte — e uma medida ideológica genuína não inverteria.
 *
 * Daí a regra que não pode ser relaxada: **as portas 2 e 3 não são substitutas
 * uma da outra.** A âncora sozinha quase valida governismo; o falseamento
 * sozinho não diz se a ordenação faz sentido. Baixar este limiar "porque a
 * âncora já cobre" é exatamente o erro que ele existe para impedir.
 *
 * `MAX_GOVERNMENT_CORRELATION` — o teste de falseamento. Se a leitura econômica
 * dos agentes correlaciona com o governismo deles acima disto, o índice está
 * medindo apoio ao Executivo e chamando aquilo de ideologia. O primeiro
 * componente principal cru mede −0,96 nesse teste; 0,50 é o ponto em que a
 * contaminação deixa de ser residual.
 *
 * Isto é a reprodução de um achado publicado, não um defeito nosso. Izumi
 * (*Dados* 59(1), 2016) rodou Optimal Classification sobre 1.408 votações
 * nominais do Senado (1989–2010): a primeira dimensão correlaciona **0,95, 0,93,
 * 0,75 e −0,94/−0,96** com seguir o líder do governo, conforme a legislatura, e
 * **o sinal vira quando o presidente troca**. A conclusão dele é a nossa porta:
 * *"essa primeira dimensão de fato representa uma clivagem entre governo versus
 * oposição e não as preferências ideológicas dos parlamentares."* Spirling &
 * McLean (*Political Analysis* 15(1), 2007) mostram o mesmo em Westminster com
 * **99,1% de classificação correta** — e Corbyn, Benn e Skinner classificados
 * como os trabalhistas mais à direita. **Ajuste alto não é validade.**
 */
export const MIN_ANCHOR_CORRELATION = 0.85;
export const MAX_GOVERNMENT_CORRELATION = 0.5;

/**
 * Acima desta correlação entre os dois eixos, o social deixa de ser publicado
 * como número próprio.
 *
 * **No Brasil os dois eixos praticamente não se separam**, e isso é medido, não
 * suposto. Martínez-Gallardo et al. (*Party Politics*, 2023) rodaram análise
 * fatorial confirmatória sobre os itens do CHES: um segundo fator compra +0,234
 * de CFI na Europa e **+0,045 na América Latina**, e a correlação entre as duas
 * dimensões latentes é **0,95 lá contra 0,58 aqui**. Nos onze partidos
 * brasileiros do CHES-LA, r(econômico, social) = **0,94**.
 *
 * O resíduo é real e vale a figura: ele separa a direita economicamente liberal
 * e socialmente moderada (PSDB, NOVO) da direita moral-autoritária (PL,
 * Republicanos, PSC). Mas é um décimo da variância, carregado por dois partidos
 * — é uma forma, não um segundo veredito. Por isso a figura de dois eixos
 * continua desenhada e o segundo NÚMERO se cala quando a colinearidade dispara.
 */
export const MAX_AXIS_CORRELATION = 0.85;

/** Cobertura mínima de cadeiras ancoradas para a correlação significar algo. */
export const MIN_ANCHOR_COVERAGE = 0.6;
