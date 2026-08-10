/**
 * Cost forecast for the `ai:summaries` job, before you commit to running it.
 *
 *   npm run estimate:ai            # usa a contagem real de temas do banco
 *   npm run estimate:ai -- --themes 500
 *
 * Two modes, automatically:
 *   * **Exato** — with `ANTHROPIC_API_KEY` set, token counts come from the
 *     `count_tokens` endpoint, which is free and does not run the model.
 *   * **Estimado** — without a key, tokens are derived from character counts
 *     using {@link CHARS_PER_TOKEN}. Good to roughly ±15%; the point is to tell
 *     "cents" from "hundreds of dollars", not to bill anyone.
 *
 * The theme count comes from the database when reachable (the same query the
 * job itself uses), so the number reflects your actual backlog rather than a
 * guess. Pass `--themes N` to price a hypothetical volume instead.
 */
import Anthropic from "@anthropic-ai/sdk";
import { db } from "@/lib/db";
import { env, isAiEnabled } from "@/lib/env";
import { BRIEF_TOOL, SYSTEM_PROMPT, buildUserContent } from "@/lib/ai/summarize";

/**
 * Characters per token, averaged over this prompt's actual mix.
 *
 * Not the prose ratio: most of the input is the tool's JSON schema, and JSON
 * tokenizes far worse than Portuguese prose because of its punctuation. Checked
 * against `count_tokens` on a real bill — a prose-only ratio (3.2) came out 75%
 * low. Only used when no API key is available to ask the real tokenizer.
 */
const CHARS_PER_TOKEN = 1.85;

/** Haiku 4.5 list price, US$ per million tokens. */
const PRICE_PER_MTOK = { input: 1.0, output: 5.0 };

/**
 * Output budget per theme. The tool call carries a ~70-char title, a ~300-char
 * summary and three numbers — about 135 tokens. Rounded up by half again, so
 * the forecast errs high rather than low.
 */
const OUTPUT_TOKENS_PER_THEME = 200;

/** Rough BRL conversion, only to make the figure legible. */
const USD_TO_BRL = 5.4;

/** A representative theme, for measuring one request's prompt. */
interface Sample {
  identifier: string | null;
  name: string;
  summary: string;
  keywords: string | null;
  classifications: string[];
}

/** Median-sized bill, used when the database has nothing to sample. */
const FALLBACK_SAMPLE: Sample = {
  identifier: "PL 3085/2026",
  name: "Regulamenta o regime de relevância das questões de direito federal infraconstitucional",
  summary:
    "Regulamenta o regime de relevância das questões de direito federal infraconstitucional para admissão do recurso especial, alterando o Código de Processo Civil e a Lei de Introdução às Normas do Direito Brasileiro.",
  keywords:
    "Recurso especial, relevância, questão de direito federal, Superior Tribunal de Justiça (STJ), Código de Processo Civil (CPC), admissibilidade.",
  classifications: ["Direito e Justiça", "Direito Civil e Processual Civil"],
};

/** Read `--themes N`, when the caller wants to price a hypothetical volume. */
function parseThemeOverride(argv: string[]): number | null {
  const i = argv.indexOf("--themes");
  if (i < 0) return null;
  const n = Number(argv[i + 1]);
  if (!Number.isFinite(n) || n <= 0) {
    console.error(`Valor inválido para --themes: "${argv[i + 1]}".`);
    process.exit(2);
  }
  return Math.floor(n);
}

/**
 * Input tokens for one request, exactly as the API will count them.
 *
 * Also measures the fixed overhead — system prompt plus tool schema, resent on
 * every single request — because that is where the money actually goes: the
 * bill's own text is a small minority of the tokens, so the lever for cutting
 * cost is a terser tool schema, not a shorter ementa.
 */
async function countInputTokens(
  sample: Sample,
): Promise<{ tokens: number; fixed: number | null; exact: boolean }> {
  const userContent = buildUserContent({
    identifier: sample.identifier,
    officialTitle: sample.name,
    officialSummary: sample.summary,
    keywords: sample.keywords,
    classifications: sample.classifications,
  });

  if (isAiEnabled()) {
    try {
      const client = new Anthropic({ apiKey: env.anthropicApiKey });
      const [full, bare] = await Promise.all([
        client.messages.countTokens({
          model: env.anthropicSummaryModel,
          system: SYSTEM_PROMPT,
          tools: [BRIEF_TOOL],
          messages: [{ role: "user", content: userContent }],
        }),
        // Same request with a one-character user turn: the difference is what
        // the bill's own text costs, and the remainder is fixed overhead.
        client.messages.countTokens({
          model: env.anthropicSummaryModel,
          system: SYSTEM_PROMPT,
          tools: [BRIEF_TOOL],
          messages: [{ role: "user", content: "." }],
        }),
      ]);
      return { tokens: full.input_tokens, fixed: bare.input_tokens, exact: true };
    } catch {
      // Fall through to the character estimate rather than failing the forecast.
    }
  }

  const chars = SYSTEM_PROMPT.length + JSON.stringify(BRIEF_TOOL).length + userContent.length;
  return { tokens: Math.round(chars / CHARS_PER_TOKEN), fixed: null, exact: false };
}

/** `US$ 1,23 (R$ 6,64)` */
function money(usd: number): string {
  const brl = usd * USD_TO_BRL;
  const fmt = (n: number) => (n < 1 ? n.toFixed(3) : n.toFixed(2)).replace(".", ",");
  return `US$ ${fmt(usd)} (R$ ${fmt(brl)})`;
}

async function main(): Promise<void> {
  const override = parseThemeOverride(process.argv.slice(2));

  // Sample a real pending theme so the forecast reflects your own data.
  let sample: Sample = FALLBACK_SAMPLE;
  let pending = override;
  let dbReachable = false;

  try {
    const [row, count] = await Promise.all([
      db.theme.findFirst({
        where: { status: "ACTIVE", plainSummary: null, summary: { not: "" } },
        orderBy: [{ inProgress: "desc" }, { priority: "desc" }],
        select: { identifier: true, name: true, summary: true, keywords: true, classifications: true },
      }),
      db.theme.count({ where: { status: "ACTIVE", plainSummary: null, summary: { not: "" } } }),
    ]);
    dbReachable = true;
    if (row) {
      sample = {
        identifier: row.identifier,
        name: row.name,
        summary: row.summary,
        keywords: row.keywords,
        classifications: Array.isArray(row.classifications)
          ? row.classifications
              .map((c) => (c && typeof c === "object" ? (c as { label?: unknown }).label : null))
              .filter((l): l is string => typeof l === "string")
          : [],
      };
    }
    pending = override ?? count;
  } catch {
    // No database: price the hypothetical volumes only.
  }

  const { tokens: inputTokens, fixed, exact } = await countInputTokens(sample);
  const perTheme =
    (inputTokens / 1_000_000) * PRICE_PER_MTOK.input +
    (OUTPUT_TOKENS_PER_THEME / 1_000_000) * PRICE_PER_MTOK.output;

  console.log(`\nModelo: ${env.anthropicSummaryModel}  (US$ ${PRICE_PER_MTOK.input}/MTok entrada, US$ ${PRICE_PER_MTOK.output}/MTok saída)`);
  console.log(exact ? "Contagem de tokens: exata (count_tokens)" : `Contagem de tokens: estimada (${CHARS_PER_TOKEN} chars/token)`);
  console.log(`\nPor tema: ~${inputTokens} tokens de entrada + ~${OUTPUT_TOKENS_PER_THEME} de saída = ${money(perTheme)}`);
  if (fixed !== null) {
    const share = ((fixed / inputTokens) * 100).toFixed(0);
    console.log(
      `  Desses, ${fixed} são fixos (system + schema da ferramenta) — ${share}% da entrada,\n` +
        `  reenviados a cada chamada. O texto da proposição custa ~${inputTokens - fixed} tokens.`,
    );
  }

  const volumes = pending != null ? [pending] : [100, 300, 1000, 5000, 13000];
  console.log("");
  for (const n of volumes) {
    const label = pending != null && !override ? `${n} temas sem resumo (no seu banco)` : `${n} temas`;
    console.log(`  ${label.padEnd(42)} ${money(perTheme * n)}`);
  }

  if (pending == null && !dbReachable) {
    console.log("\n  (banco indisponível — volumes hipotéticos; rode com o banco no ar para o número real)");
  }

  console.log("\nNotas:");
  console.log(
    `  · Cache de prompt não se aplica: o prefixo fixo tem ${fixed ?? "~1.500"} tokens e o\n` +
      "    mínimo do Haiku 4.5 é 4.096 — não haveria acerto de cache.",
  );
  console.log("  · A Batch API cortaria 50%, ao custo de um fluxo assíncrono. Nestes");
  console.log("    valores absolutos, raramente compensa a complexidade.");
  console.log("  · O job só processa temas com resumo ausente, então este é um custo");
  console.log("    de carga inicial; depois, só os temas novos de cada semana.");
  console.log("  · Reprocessar um tema exige limpar `plainSummary` — não há gasto duplo.\n");

  await db.$disconnect().catch(() => {});
}

void main().catch(async (err) => {
  console.error("Falha:", err instanceof Error ? err.message : err);
  await db.$disconnect().catch(() => {});
  process.exit(1);
});
