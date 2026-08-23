/**
 * Cost forecast for the `ai:summaries` job, before you commit to running it.
 *
 *   npm run estimate:ai                  # usa a contagem real de temas do banco
 *   npm run estimate:ai -- --no-db       # sem banco: volumes hipotéticos
 *   npm run estimate:ai -- --themes 7000
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
 * guess. `--themes N` prices a hypothetical volume; `--no-db` skips the database
 * entirely, which is what makes this runnable from an environment that is not
 * allowed to query one.
 */
// Must precede every import that reads `env` at module load.
import "./load-env";
import Anthropic from "@anthropic-ai/sdk";
import { db } from "@/lib/db";
import { env, isAiEnabled } from "@/lib/env";
import { BRIEF_TOOL, SYSTEM_PROMPT, buildUserContent } from "@/lib/ai/summarize";
import { AI_ELIGIBLE, DEFAULT_BATCH, MIN_AI_PRIORITY } from "@/lib/integration/summaries";

/**
 * Characters per token, averaged over this prompt's actual mix.
 *
 * Not the prose ratio: most of the input is the tool's JSON schema, and JSON
 * tokenizes far worse than Portuguese prose because of its punctuation. Checked
 * against `count_tokens` on a real bill — a prose-only ratio (3.2) came out 75%
 * low. Only used when no API key is available to ask the real tokenizer.
 */
const CHARS_PER_TOKEN = 1.85;

/**
 * List price and cache floor per model, US$ per million tokens.
 *
 * `cacheMinimum` is the shortest prefix the model will cache **at all**, and it
 * is the field that decides this whole forecast — because ~90% of the input here
 * is a fixed prefix (system prompt + tool schema) resent identically on every
 * call. Below the floor nothing caches and no error is raised: you just pay full
 * price forever and `cache_creation_input_tokens` stays at zero.
 *
 * The floor is **not monotonic across generations**, which is the trap. Haiku
 * 4.5 — the cheap model, the obvious choice — has the *highest* floor of the
 * current family at 4.096, so the prefix here misses it and every call pays in
 * full. Sonnet 5 caches from 1.024 and Opus 5 from 512, so both cache it. The
 * consequence is worth stating plainly: a more expensive model that caches can
 * come out cheaper per theme than a cheap one that cannot.
 */
const MODELS: Record<string, { input: number; output: number; cacheMinimum: number }> = {
  "claude-haiku-4-5": { input: 1.0, output: 5.0, cacheMinimum: 4096 },
  "claude-sonnet-5": { input: 3.0, output: 15.0, cacheMinimum: 1024 },
  "claude-sonnet-4-6": { input: 3.0, output: 15.0, cacheMinimum: 1024 },
  "claude-opus-4-8": { input: 5.0, output: 25.0, cacheMinimum: 1024 },
  "claude-opus-5": { input: 5.0, output: 25.0, cacheMinimum: 512 },
};

/** Cache read costs a tenth of the base rate; a cache write costs 1.25x. */
const CACHE_READ_MULTIPLIER = 0.1;

/**
 * Output budget per theme. The tool call carries a ~70-char title, a ~300-char
 * summary and three numbers — about 135 tokens. Rounded up by half again, so
 * the forecast errs high rather than low.
 */
const OUTPUT_TOKENS_PER_THEME = 200;

/** Rough BRL conversion, only to make the figure legible. Not a live rate. */
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

/** Cost of one theme on one model, with and without the cache floor honoured. */
function perTheme(
  price: { input: number; output: number; cacheMinimum: number },
  inputTokens: number,
  fixedTokens: number,
): { usd: number; cached: boolean } {
  const cached = fixedTokens >= price.cacheMinimum;
  const input = cached
    ? (fixedTokens / 1_000_000) * price.input * CACHE_READ_MULTIPLIER +
      ((inputTokens - fixedTokens) / 1_000_000) * price.input
    : (inputTokens / 1_000_000) * price.input;
  return { usd: input + (OUTPUT_TOKENS_PER_THEME / 1_000_000) * price.output, cached };
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const override = parseThemeOverride(argv);
  const skipDb = argv.includes("--no-db");

  let sample: Sample = FALLBACK_SAMPLE;
  let pending = override;
  let dbReachable = false;
  let excluded = 0;

  // `--no-db` exists because the forecast is useful from places that must not
  // touch the database at all; the sample below is a real median bill, so the
  // per-theme figure is the same either way — only the backlog count is lost.
  if (!skipDb) {
    try {
      // The same predicate the job runs, imported rather than restated: a second
      // copy would drift and the forecast would quote a queue that no longer
      // exists. `all` is kept only to show how much the population rule removes.
      const eligible = { status: "ACTIVE" as const, plainSummary: null, summary: { not: "" }, ...AI_ELIGIBLE };
      const [row, count, all] = await Promise.all([
        db.theme.findFirst({
          where: eligible,
          orderBy: [{ inProgress: "desc" }, { priority: "desc" }],
          select: { identifier: true, name: true, summary: true, keywords: true, classifications: true },
        }),
        db.theme.count({ where: eligible }),
        db.theme.count({ where: { status: "ACTIVE", plainSummary: null, summary: { not: "" } } }),
      ]);
      excluded = all - count;
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
  }

  const { tokens: inputTokens, fixed, exact } = await countInputTokens(sample);
  // Without `count_tokens` the split is derived the same way the total is.
  const fixedTokens =
    fixed ??
    Math.round((SYSTEM_PROMPT.length + JSON.stringify(BRIEF_TOOL).length) / CHARS_PER_TOKEN);

  const current = MODELS[env.anthropicSummaryModel];
  if (!current) {
    console.error(`\nModelo ${env.anthropicSummaryModel} não está na tabela de preços — adicione-o em MODELS.\n`);
    process.exit(2);
  }

  const here = perTheme(current, inputTokens, fixedTokens);

  console.log(`\nModelo: ${env.anthropicSummaryModel}  (US$ ${current.input}/MTok entrada, US$ ${current.output}/MTok saída)`);
  console.log(exact ? "Contagem de tokens: exata (count_tokens)" : `Contagem de tokens: estimada (${CHARS_PER_TOKEN} chars/token, ±15%)`);

  console.log(`\nPor tema: ~${inputTokens} tokens de entrada + ~${OUTPUT_TOKENS_PER_THEME} de saída = ${money(here.usd)}`);
  const share = ((fixedTokens / inputTokens) * 100).toFixed(0);
  console.log(
    `  Desses, ${fixedTokens} são fixos (system + schema da ferramenta) — ${share}% da entrada,\n` +
      `  reenviados a cada chamada. O texto da proposição custa ~${inputTokens - fixedTokens} tokens.`,
  );
  console.log(
    here.cached
      ? `  O prefixo fixo CACHEIA neste modelo (mínimo ${current.cacheMinimum}), e é isso que o preço acima já considera.`
      : `  O prefixo fixo NÃO cacheia neste modelo (mínimo ${current.cacheMinimum} > ${fixedTokens}): paga-se cheio toda vez.`,
  );

  // Volumes that mean something operationally, not round numbers.
  const volumes: Array<[number, string]> = [
    [DEFAULT_BATCH, `uma execução do job (DEFAULT_BATCH=${DEFAULT_BATCH})`],
    [DEFAULT_BATCH * 4.33, "um mês de execuções semanais"],
  ];
  if (pending != null) {
    volumes.push([pending, override ? `${pending} temas` : `${pending} temas elegíveis (seu banco)`]);
  }

  console.log("");
  for (const [n, label] of volumes) {
    const total = here.usd * n;
    console.log(`  ${label.padEnd(44)} ${money(total).padEnd(26)} com Batch API: ${money(total / 2)}`);
  }

  if (pending != null && pending > DEFAULT_BATCH) {
    const weeks = Math.ceil(pending / DEFAULT_BATCH);
    console.log(
      `\n  A ${DEFAULT_BATCH}/semana, limpar ${pending} temas leva ${weeks} semanas (~${(weeks / 4.33).toFixed(1)} meses).\n` +
        `  Para encurtar: npm run sync ai:summaries -- --limit ${pending}`,
    );
  }

  console.log("\nOutros modelos, mesmo prompt:");
  for (const [id, price] of Object.entries(MODELS)) {
    if (id === env.anthropicSummaryModel) continue;
    const alt = perTheme(price, inputTokens, fixedTokens);
    const delta = ((alt.usd / here.usd - 1) * 100).toFixed(0);
    const sign = alt.usd >= here.usd ? "+" : "";
    console.log(
      `  ${id.padEnd(20)} ${money(alt.usd).padEnd(24)} ${sign}${delta}%  ${alt.cached ? `cache OK (min ${price.cacheMinimum})` : `sem cache (min ${price.cacheMinimum})`}`,
    );
  }

  if (pending == null && !dbReachable) {
    console.log(`\n  (${skipDb ? "--no-db" : "banco indisponível"} — sem a contagem do backlog; use --themes N)`);
  }

  if (excluded > 0) {
    console.log(
      `\n  A regra de população deixou ${excluded.toLocaleString("pt-BR")} tema(s) de fora — ` +
        `arquivados ou\n  de baixa prioridade sem voto. Eles ficam com o título e a ementa oficiais.`,
    );
  }

  console.log("\nNotas:");
  console.log("  · O piso de cache é POR MODELO e não cresce com a geração: Haiku 4.5 exige");
  console.log("    4.096 tokens, Sonnet 5 exige 1.024 e Opus 5 exige 512. Como aqui o prefixo");
  console.log(`    fixo é ${share}% da entrada, isso pode inverter a ordem de custo — um modelo mais`);
  console.log("    caro que cacheia sai por menos que um barato que não cacheia.");
  console.log("  · A Batch API corta 50% e este job é o caso de uso exato dela: assíncrono,");
  console.log("    semanal, sem ninguém esperando a resposta.");
  console.log("  · A maior alavanca estrutural é o schema da ferramenta, sozinho a maior parte");
  console.log("    do prefixo fixo. Encurtá-lo reduz toda chamada, para sempre.");
  console.log("  · CODING_RUNS=1 hoje. Subir para 2 (dupla codificação, docs/posicionamento.md)");
  console.log("    dobra exatamente este custo.");
  console.log(`  · A fila é limitada (AI_ELIGIBLE): temas já votados por um agente, mais os`);
  console.log(`    em tramitação com prioridade >= ${MIN_AI_PRIORITY}. Sem esse limite a fila não converge —`);
  console.log("    a varredura ampla importa mais por semana do que o job consegue processar.");
  console.log(`  · Câmbio fixo de R$ ${USD_TO_BRL.toFixed(2).replace(".", ",")} no código — não é cotação do dia.\n`);

  await db.$disconnect().catch(() => {});
}

void main().catch(async (err) => {
  console.error("Falha:", err instanceof Error ? err.message : err);
  await db.$disconnect().catch(() => {});
  process.exit(1);
});
