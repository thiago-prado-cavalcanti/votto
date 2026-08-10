/**
 * Plain-language layer for imported bills.
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
 * The same pass also proposes the theme's position on the two axes the
 * positioning index needs (CLAUDE.md §3.2). That is a genuine editorial
 * judgement, so it is recorded as `dimensionsSource: "AI"` and an editor's
 * tagging is never overwritten by a later run.
 *
 * Runs on a deliberately cheap model (Haiku by default): the task is reading
 * comprehension over a short text, not reasoning, and there are hundreds of
 * bills to process.
 *
 * Deliberately NOT marked `server-only`: this runs inside the sync worker and
 * the CLI, which execute outside the Next.js runtime where that guard resolves.
 * Nothing here is imported by client components — the API key never leaves the
 * server because only server code and scripts reach this module.
 */
import Anthropic from "@anthropic-ai/sdk";
import { env, isAiEnabled } from "@/lib/env";

/** What the model is asked to produce for one bill. */
export interface ThemeBrief {
  /** Headline in plain Portuguese, ≤ 70 characters. */
  plainTitle: string;
  /** Two or three sentences: what it does, and whom it affects. */
  plainSummary: string;
  /** −1 (state-led) … +1 (market-led) — how a YES vote leans economically. */
  economic: number;
  /** −1 (community) … +1 (individual) — how a YES vote leans socially. */
  social: number;
  /** The model's own confidence in the two axes, 0–1. */
  confidence: number;
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
 * The single tool the model must call. Forcing a tool call is how this SDK
 * version guarantees a parseable object — there is no free-text path to get
 * wrong. The installed SDK does not yet type strict tool use, so the shape is
 * validated on our side in {@link parseBrief}.
 */
export const BRIEF_TOOL: Anthropic.Tool = {
  name: "registrar_resumo",
  description:
    "Registra o resumo em linguagem simples e o posicionamento de uma proposição legislativa.",
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
      economic: {
        type: "number",
        description:
          "Eixo econômico de −1 a 1: quanto o voto SIM puxa para mais Estado (−1: estatização, mais gasto público, mais regulação) ou mais Mercado (+1: privatização, desoneração, desregulamentação). 0 = sem efeito econômico claro.",
      },
      social: {
        type: "number",
        description:
          "Eixo social de −1 a 1: quanto o voto SIM puxa para Comunidade (−1: valores tradicionais, coletivo, mais autoridade do Estado sobre condutas) ou Indivíduo (+1: liberdades individuais, autonomia pessoal). 0 = sem efeito social claro.",
      },
      confidence: {
        type: "number",
        description:
          "0 a 1: sua confiança nos dois eixos. Use valores baixos para propostas técnicas, administrativas ou sem conteúdo ideológico claro.",
      },
    },
    required: ["plainTitle", "plainSummary", "economic", "social", "confidence"],
    additionalProperties: false,
  },
};

export const SYSTEM_PROMPT = [
  "Você explica proposições legislativas brasileiras para cidadãos comuns.",
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
  "Sobre os eixos de posicionamento: julgue a direção do voto SIM pelo conteúdo",
  "da proposta, não pelo partido de quem a propôs. Muitas proposições são",
  "administrativas ou técnicas e não têm carga ideológica — nesses casos use",
  "valores próximos de zero e confiança baixa. É melhor admitir neutralidade do",
  "que forçar um posicionamento.",
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

/** Clamp a model-supplied axis value into the −1..1 the index expects. */
function clampAxis(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(-1, Math.min(1, n));
}

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

  const confidence = Number(v.confidence);
  return {
    plainTitle: plainTitle.slice(0, 120),
    plainSummary,
    economic: clampAxis(v.economic),
    social: clampAxis(v.social),
    confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0,
  };
}
