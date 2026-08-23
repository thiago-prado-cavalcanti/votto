/**
 * Plain-language layer for imported bills, and the axis coding behind the
 * positioning index.
 *
 * Official ementas are written for lawyers: a single 300-character sentence of
 * subordinate clauses and statute cross-references. A citizen scanning the
 * themes list cannot tell from one what the bill actually does. This step reads
 * the official text and produces a short headline plus a two-or-three sentence
 * explanation in everyday Portuguese.
 *
 * **Nothing official is overwritten.** `name`, `summary`, `identifier` and the
 * source link stay exactly as imported; the generated text lands in
 * `plainTitle` / `plainSummary` and is always shown alongside — never instead
 * of — the original, with the model that produced it recorded on the row.
 *
 * ── A classificação nos eixos, e por que ela mudou de forma ─────────────────
 *
 * A mesma passagem classifica a proposição nos dois eixos de valor (§3.2). O que
 * ela pedia antes era **um número de −1 a 1 por eixo**, e três coisas estavam
 * erradas nisso:
 *
 *  - **Direção e magnitude vinham fundidas.** Um `0,3` podia significar
 *    "levemente pró-mercado" ou "possivelmente pró-mercado", que são fatos
 *    diferentes: o primeiro é uma medida, o segundo é uma dúvida. Agora são
 *    campos separados, e só o sinal — um julgamento nominal de três classes — é
 *    o que se afirma com confiança. Mikhaylov, Laver & Benoit (*Political
 *    Analysis* 20(1), 2012) mediram a codificação fina do Manifesto Project e
 *    encontraram κ entre 0,05 e 0,18 nas categorias mais difíceis: a graduação
 *    não sobrevive nem a codificadores humanos treinados.
 *  - **Não havia como uma proposição sair do índice.** Homenagem, requerimento
 *    de urgência, denominação de rodovia — tudo recebia dois números. A Câmara
 *    de 2025 tem 58,8% de votações procedimentais e 5% de proposições de
 *    homenagem; sem exclusão, o índice mede a pauta administrativa.
 *  - **O modelo classificava a EMENTA, não a pergunta da votação.** Num
 *    requerimento de urgência, Sim significa "pautar", não "apoiar"; num
 *    destaque supressivo, Sim significa "suprimir". Ler o assunto do projeto e
 *    ignorar o que a votação perguntou inverte o sinal numa minoria grande dos
 *    casos. Daí o campo `yesMeans`, que é obrigatório e vem antes dos eixos.
 *
 * As definições dos eixos são as do **Chapel Hill Expert Survey**, traduzidas —
 * escolha deliberada: é a operacionalização mais cuidadosamente redigida em
 * circulação, e usá-la é o que torna o resultado conferível contra uma medida
 * externa em vez de contra si mesmo.
 *
 * Runs on a deliberately cheap model (Haiku by default): the task is reading
 * comprehension over a short text, not reasoning, and there are hundreds of
 * bills to process. Temperatura 0,2 — Gilardi, Alizadeh & Kubli (*PNAS* 120(30),
 * 2023) mediram a autoconsistência de um classificador subindo de 91% para 97%
 * ao baixar a temperatura, sem perda de acurácia.
 *
 * Deliberately NOT marked `server-only`: this runs inside the sync worker and
 * the CLI, which execute outside the Next.js runtime where that guard resolves.
 * Nothing here is imported by client components — the API key never leaves the
 * server because only server code and scripts reach this module.
 */
import Anthropic from "@anthropic-ai/sdk";
import { env, isAiEnabled } from "@/lib/env";

/** Por que uma proposição não entra no índice de posicionamento. */
export type ThemeExclusion =
  | "honorific"
  | "procedural"
  | "local"
  | "budget"
  | "apolitical"
  | "ambiguous";

/** Como a proposição carrega um eixo. */
export interface AxisCoding {
  /** −1, 0 ou +1. Zero significa "este eixo não é tocado". */
  direction: -1 | 0 | 1;
  /** 0..1 — quanto. */
  magnitude: number;
  /** 0..1 — confiança neste eixo especificamente. */
  confidence: number;
}

/** What the model is asked to produce for one bill. */
export interface ThemeBrief {
  /** Headline in plain Portuguese, ≤ 70 characters. */
  plainTitle: string;
  /** Two or three sentences: what it does, and whom it affects. */
  plainSummary: string;
  /** Uma frase: o que um voto SIM faz acontecer. */
  yesMeans: string;
  /** Motivo de exclusão, ou null quando a proposição é classificável. */
  exclusion: ThemeExclusion | null;
  economic: AxisCoding | null;
  social: AxisCoding | null;
  /** 0..1 — centralidade no debate nacional. */
  salience: number;
  /** Trecho da ementa que sustenta o sinal. */
  evidence: string | null;
}

/** The bill text handed to the model. */
export interface ThemeBriefInput {
  identifier: string | null;
  officialTitle: string;
  officialSummary: string;
  keywords?: string | null;
  classifications?: string[];
}

/**
 * Longest official summary sent to the model. Ementas run to a few hundred
 * characters; the cap only guards against a pathological outlier.
 */
const MAX_SUMMARY_CHARS = 4000;

/**
 * Temperatura da classificação.
 *
 * Baixa, não zero: zero absoluto não é oferecido como garantia pela API e 0,2 é
 * o valor em que a autoconsistência medida na literatura já satura.
 */
export const CODING_TEMPERATURE = 0.2;

/**
 * Quantas vezes cada proposição é classificada antes de a tag ser aceita.
 *
 * **Um, hoje — e isso é uma dívida conhecida, não uma conclusão.** O protocolo
 * de auditoria (`docs/posicionamento.md`) exige duas codificações independentes
 * com aceitação apenas onde os sinais coincidem: Gunes & Florczak mediram 83% de
 * acurácia na fatia de 65% em que dois modelos concordaram, contra 58–83% no
 * geral, e é o portão mais barato que existe contra uma tag instável.
 *
 * Subir para 2 dobra o custo da passagem de IA sobre centenas de proposições,
 * então é uma decisão de produto e não de engenharia. Enquanto for 1, a
 * consistência gravada em cada tag é `null`, e a página de metodologia diz isso.
 */
export const CODING_RUNS = 1;

/**
 * The single tool the model must call. Forcing a tool call is how this SDK
 * version guarantees a parseable object — there is no free-text path to get
 * wrong. The installed SDK does not yet type strict tool use, so the shape is
 * validated on our side in {@link parseBrief}.
 */
export const BRIEF_TOOL: Anthropic.Tool = {
  name: "registrar_resumo",
  description:
    "Registra o resumo em linguagem simples e a classificação de uma proposição legislativa.",
  input_schema: {
    type: "object",
    properties: {
      plainTitle: {
        type: "string",
        description:
          "Título curto em português claro, no máximo 70 caracteres, sem jargão jurídico e sem o número da proposição. Ex.: 'Isenta remédios de imposto federal'.",
      },
      plainSummary: {
        type: "string",
        description:
          "Duas ou três frases explicando o que a proposta faz e quem ela afeta, em linguagem cotidiana. Neutro: nunca diga se é boa ou ruim.",
      },
      yesMeans: {
        type: "string",
        description:
          "Uma frase: o que um voto SIM faz acontecer, em termos do que muda na vida real. Se a proposta apenas cria uma data, dá nome a algo ou trata de rito interno, diga isso.",
      },
      exclusion: {
        type: ["string", "null"],
        enum: ["honorific", "procedural", "local", "budget", "apolitical", "ambiguous", null],
        description:
          "Motivo para a proposição NÃO entrar num índice de posicionamento político, ou null se ela entra. " +
          "honorific: homenagem, data comemorativa, denominação de via, prédio ou instituição. " +
          "procedural: o voto é sobre o rito e não sobre o mérito (urgência, destaque, redação final). " +
          "local: interesse estritamente municipal ou de uma obra específica, sem política nacional. " +
          "budget: peça orçamentária sem conteúdo de política. " +
          "apolitical: administrativa ou técnica, real mas sem carga ideológica. " +
          "ambiguous: você não conseguiu determinar o que a proposta faz.",
      },
      economicDirection: {
        type: "integer",
        enum: [-1, 0, 1],
        description:
          "Eixo econômico. Um voto SIM empurra para MAIS ESTADO (−1: estatização, mais gasto público, mais regulação, ampliação da previdência) ou para MAIS MERCADO (+1: privatização, desoneração, desregulamentação, limitação do gasto)? Use 0 se a proposta não toca economia. Zero é a resposta certa na maioria das proposições — prefira 0 a forçar um lado.",
      },
      economicMagnitude: {
        type: "number",
        description:
          "0 a 1: o tamanho do efeito econômico. Só preencha se a direção não for 0. Uma mudança marginal é 0,3; uma reforma estrutural é 1.",
      },
      economicConfidence: {
        type: "number",
        description: "0 a 1: sua confiança NA DIREÇÃO econômica que você deu.",
      },
      socialDirection: {
        type: "integer",
        enum: [-1, 0, 1],
        description:
          "Eixo social. Um voto SIM empurra para ORDEM (−1: tradição, autoridade moral do Estado sobre condutas, endurecimento penal, restrição de comportamentos) ou para LIBERDADES (+1: autonomia pessoal, direitos reprodutivos, união homoafetiva, descriminalização)? Use 0 se a proposta não toca costumes. Zero é a resposta certa na maioria das proposições.",
      },
      socialMagnitude: {
        type: "number",
        description: "0 a 1: o tamanho do efeito social. Só preencha se a direção não for 0.",
      },
      socialConfidence: {
        type: "number",
        description: "0 a 1: sua confiança NA DIREÇÃO social que você deu.",
      },
      salience: {
        type: "number",
        description:
          "0 a 1: o quanto esta proposição é central no debate político nacional. Uma reforma tributária é 1; uma alteração de prazo processual é 0,1.",
      },
      evidence: {
        type: "string",
        description:
          "Um trecho curto da ementa ou do título, copiado literalmente, que sustenta as direções que você deu. Se você marcou os dois eixos como 0, deixe vazio.",
      },
    },
    required: [
      "plainTitle",
      "plainSummary",
      "yesMeans",
      "exclusion",
      "economicDirection",
      "socialDirection",
      "salience",
    ],
    additionalProperties: false,
  },
};

export const SYSTEM_PROMPT = [
  "Você explica proposições legislativas brasileiras para cidadãos comuns e as",
  "classifica em dois eixos de valor.",
  "",
  "## O resumo",
  "",
  "Escreva como quem explica a um vizinho: frases curtas, palavras do dia a dia,",
  "sem jargão jurídico e sem citar artigos ou leis por número. Se a proposta usa",
  "um termo técnico incontornável, explique-o na mesma frase.",
  "",
  "Seja estritamente neutro. Descreva o que a proposta faz e quem ela afeta;",
  "nunca diga se é boa, ruim, necessária ou perigosa, e não use adjetivos de",
  "valor. Baseie-se apenas no texto fornecido — não invente efeitos, números,",
  "prazos ou intenções que não estejam ali.",
  "",
  "## A ordem em que você deve pensar",
  "",
  "1. Primeiro, decida se a proposição deve ser EXCLUÍDA. Homenagens, datas",
  "   comemorativas, denominações de rodovias e prédios, matéria de rito interno,",
  "   obras de interesse estritamente local e peças orçamentárias não medem",
  "   posição política de ninguém. Se for o caso, marque `exclusion` e pare de se",
  "   preocupar com os eixos.",
  "2. Depois, diga em uma frase o que um voto SIM faz acontecer (`yesMeans`).",
  "   Isso vem ANTES dos eixos porque é frequente que a pergunta da votação não",
  "   seja o assunto do projeto.",
  "3. Só então classifique cada eixo, e classifique primeiro a DIREÇÃO: mais",
  "   Estado ou mais Mercado; mais Ordem ou mais Liberdades. Só depois estime o",
  "   tamanho.",
  "",
  "## Os dois eixos",
  "",
  "EIXO ECONÔMICO (Estado ↔ Mercado). Trata de privatização, impostos,",
  "regulação, gasto público e previdência. O polo Estado quer o poder público",
  "atuando na economia; o polo Mercado quer esse papel reduzido.",
  "",
  "EIXO SOCIAL (Ordem ↔ Liberdades). De um lado, ordem, tradição e autoridade",
  "moral do Estado sobre condutas; do outro, liberdades pessoais e autonomia —",
  "aborto, união homoafetiva, drogas, expressão.",
  "",
  "## A regra que mais importa",
  "",
  "ZERO E NULO SÃO RESPOSTAS CORRETAS, e são as respostas certas na maioria das",
  "proposições. A maior parte do que tramita é administrativa, técnica ou local e",
  "não carrega ideologia nenhuma. Marcar um eixo por marcar empurra a posição de",
  "uma pessoa real na direção de ruído. É melhor admitir neutralidade do que",
  "forçar um posicionamento — e é melhor admitir dúvida do que inventar",
  "confiança.",
  "",
  "Julgue pelo conteúdo da proposta, nunca pelo partido de quem a propôs.",
].join("\n");

/**
 * Assemble the user turn for one bill. Exported so the cost estimator
 * (`scripts/estimate-ai-cost.ts`) prices the exact prompt this job sends,
 * rather than an approximation that could drift from it.
 */
export function buildUserContent(input: ThemeBriefInput): string {
  return [
    input.identifier ? `Identificação oficial: ${input.identifier}` : null,
    `Título oficial: ${input.officialTitle}`,
    `Ementa oficial: ${input.officialSummary.slice(0, MAX_SUMMARY_CHARS)}`,
    input.keywords ? `Indexação: ${input.keywords}` : null,
    input.classifications?.length ? `Classificação: ${input.classifications.join("; ")}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Generate the plain-language brief for one bill.
 *
 * Returns null when AI is disabled, the model declines, or anything goes wrong —
 * callers keep the official text and move on. This never throws: a failed brief
 * must not abort a run over hundreds of bills.
 */
export async function summarizeTheme(input: ThemeBriefInput): Promise<ThemeBrief | null> {
  if (!isAiEnabled()) return null;

  const userContent = buildUserContent(input);

  try {
    const client = new Anthropic({ apiKey: env.anthropicApiKey });
    const message = await client.messages.create({
      model: env.anthropicSummaryModel,
      max_tokens: 1024,
      temperature: CODING_TEMPERATURE,
      system: SYSTEM_PROMPT,
      tools: [BRIEF_TOOL],
      tool_choice: { type: "tool", name: BRIEF_TOOL.name },
      messages: [{ role: "user", content: userContent }],
    });

    // The forced tool_choice guarantees a tool_use block on success; a refusal
    // or a truncated response leaves none, which is a null result, not a crash.
    const call = message.content.find(
      (block): block is Anthropic.ToolUseBlock => block.type === "tool_use",
    );
    return call ? parseBrief(call.input) : null;
  } catch {
    return null;
  }
}

/** Clamp a model-supplied 0..1 value. */
function clamp01(value: unknown, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(1, n));
}

/** Read one axis out of the flat tool input. */
function readAxis(
  direction: unknown,
  magnitude: unknown,
  confidence: unknown,
): AxisCoding | null {
  const d = Number(direction);
  if (!Number.isFinite(d) || d === 0) return null;
  return {
    direction: d > 0 ? 1 : -1,
    // Magnitude ausente vira 1: o que o modelo afirmou foi a direção, e degradar
    // para "efeito pleno naquele sentido" é mais honesto do que inventar uma
    // graduação que ele não deu.
    magnitude: clamp01(magnitude, 1),
    confidence: clamp01(confidence, 0.5),
  };
}

const EXCLUSIONS: ThemeExclusion[] = [
  "honorific",
  "procedural",
  "local",
  "budget",
  "apolitical",
  "ambiguous",
];

/**
 * Validate the tool input. The schema constrains the model but is not enforced
 * server-side here, so every field is re-checked: a missing string, a title that
 * ran long, an out-of-range or non-numeric axis.
 */
function parseBrief(raw: unknown): ThemeBrief | null {
  if (!raw || typeof raw !== "object") return null;
  const v = raw as Record<string, unknown>;

  const plainTitle = typeof v.plainTitle === "string" ? v.plainTitle.trim() : "";
  const plainSummary = typeof v.plainSummary === "string" ? v.plainSummary.trim() : "";
  if (!plainTitle || !plainSummary) return null;

  const exclusion =
    typeof v.exclusion === "string" && EXCLUSIONS.includes(v.exclusion as ThemeExclusion)
      ? (v.exclusion as ThemeExclusion)
      : null;

  const economic = exclusion
    ? null
    : readAxis(v.economicDirection, v.economicMagnitude, v.economicConfidence);
  const social = exclusion
    ? null
    : readAxis(v.socialDirection, v.socialMagnitude, v.socialConfidence);

  return {
    plainTitle: plainTitle.slice(0, 120),
    plainSummary,
    yesMeans: typeof v.yesMeans === "string" ? v.yesMeans.trim().slice(0, 400) : "",
    exclusion,
    economic,
    social,
    salience: clamp01(v.salience, 0),
    evidence: typeof v.evidence === "string" && v.evidence.trim() ? v.evidence.trim().slice(0, 400) : null,
  };
}
