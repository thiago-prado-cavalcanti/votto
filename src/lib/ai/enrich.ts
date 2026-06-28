/**
 * AI enrichment (CLAUDE.md §4): when an Article is added to a Theme, an AI step
 * reads the article and incrementally improves the Theme's summary.
 *
 * Gated by ANTHROPIC_API_KEY — without it (e.g. local dev), enrichment degrades
 * gracefully: the existing summary is kept and the article title/URL is appended
 * as a lightweight fallback so the flow stays functional end-to-end.
 */
import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { env, isAiEnabled } from "@/lib/env";

export interface EnrichInput {
  themeName: string;
  currentSummary: string;
  article: { title?: string | null; originalUrl: string; text?: string | null };
}

/**
 * Produce an updated theme summary that incorporates the new article.
 * Always returns a usable string (never throws to the caller).
 */
export async function enrichThemeSummary(input: EnrichInput): Promise<string> {
  const { themeName, currentSummary, article } = input;

  if (!isAiEnabled()) {
    return fallbackSummary(currentSummary, article);
  }

  try {
    const client = new Anthropic({ apiKey: env.anthropicApiKey });
    const userContent = [
      `Tema: ${themeName}`,
      ``,
      `Resumo atual (pode estar vazio):`,
      currentSummary || "(vazio)",
      ``,
      `Novo artigo a incorporar:`,
      `Título: ${article.title ?? "(sem título)"}`,
      `URL: ${article.originalUrl}`,
      article.text ? `\nConteúdo:\n${article.text.slice(0, 12000)}` : "",
    ].join("\n");

    const message = await client.messages.create({
      model: env.anthropicModel,
      max_tokens: 700,
      system:
        "Você é um analista legislativo. Atualize o resumo de um tema político " +
        "incorporando o novo artigo, de forma neutra, factual e concisa (máx. ~180 palavras), " +
        "em português do Brasil. Não invente fatos; baseie-se no conteúdo fornecido. " +
        "Responda APENAS com o novo resumo, sem preâmbulo.",
      messages: [{ role: "user", content: userContent }],
    });

    const text = message.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();

    return text.length > 0 ? text : fallbackSummary(currentSummary, article);
  } catch {
    return fallbackSummary(currentSummary, article);
  }
}

function fallbackSummary(current: string, article: EnrichInput["article"]): string {
  const ref = article.title ? `${article.title} (${article.originalUrl})` : article.originalUrl;
  const note = `Fonte adicionada: ${ref}.`;
  return current ? `${current}\n\n${note}` : note;
}
