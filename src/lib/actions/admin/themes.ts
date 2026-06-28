"use server";

/**
 * Server actions for managing themes (Theme) and their articles (Article).
 * Adding an article triggers AI enrichment of the theme summary.
 */
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { kid } from "@/lib/ids";
import { requireAdmin } from "@/lib/auth/guards";
import { enrichThemeSummary } from "@/lib/ai/enrich";
import { Prisma, type Scope } from "@/generated/prisma";

export interface ActionResult {
  ok: boolean;
  message?: string;
}

const LIST_PATH = "/admin/temas";

const SCOPES: [Scope, ...Scope[]] = ["NATIONAL", "STATE", "MUNICIPAL"];

const articleSchema = z.object({
  title: z.string().trim().optional().or(z.literal("")),
  originalUrl: z.string().trim().url("URL do artigo inválida."),
  downloadUrl: z.string().trim().url("URL de download inválida.").optional().or(z.literal("")),
});

const themeSchema = z.object({
  name: z.string().trim().min(1, "Informe o nome do tema."),
  summary: z.string().trim().optional().or(z.literal("")),
  scope: z.enum(SCOPES),
  state: z.string().trim().optional().or(z.literal("")),
  municipality: z.string().trim().optional().or(z.literal("")),
  economic: z.coerce.number().min(-1).max(1).optional(),
  social: z.coerce.number().min(-1).max(1).optional(),
});

function emptyToNull(value: unknown): string | null {
  const v = (value ?? "").toString().trim();
  return v.length === 0 ? null : v;
}

function readThemeForm(formData: FormData) {
  const economicRaw = (formData.get("economic") ?? "").toString().trim();
  const socialRaw = (formData.get("social") ?? "").toString().trim();
  return {
    name: formData.get("name"),
    summary: formData.get("summary"),
    scope: formData.get("scope"),
    state: formData.get("state"),
    municipality: formData.get("municipality"),
    economic: economicRaw === "" ? undefined : economicRaw,
    social: socialRaw === "" ? undefined : socialRaw,
  };
}

/**
 * Parse the parallel article arrays (articleTitle[], articleOriginalUrl[],
 * articleDownloadUrl[]) submitted by the theme form into validated objects.
 * Rows whose original URL is blank are ignored.
 */
function readArticles(formData: FormData): { title: string | null; originalUrl: string; downloadUrl: string | null }[] {
  const titles = formData.getAll("articleTitle").map((v) => v.toString());
  const originals = formData.getAll("articleOriginalUrl").map((v) => v.toString());
  const downloads = formData.getAll("articleDownloadUrl").map((v) => v.toString());

  const out: { title: string | null; originalUrl: string; downloadUrl: string | null }[] = [];
  for (let i = 0; i < originals.length; i++) {
    const originalUrl = (originals[i] ?? "").trim();
    if (originalUrl.length === 0) continue;
    const parsed = articleSchema.safeParse({
      title: titles[i] ?? "",
      originalUrl,
      downloadUrl: downloads[i] ?? "",
    });
    if (!parsed.success) {
      throw new Error(parsed.error.issues[0]?.message ?? "Artigo inválido.");
    }
    out.push({
      title: emptyToNull(parsed.data.title),
      originalUrl: parsed.data.originalUrl,
      downloadUrl: emptyToNull(parsed.data.downloadUrl),
    });
  }
  return out;
}

function buildDimensions(economic?: number, social?: number): Prisma.InputJsonValue | undefined {
  if (economic === undefined && social === undefined) return undefined;
  const dims: Record<string, number> = {};
  if (economic !== undefined) dims.economic = economic;
  if (social !== undefined) dims.social = social;
  return dims;
}

/**
 * Create a theme together with any submitted articles, enriching the summary
 * once per added article. Redirects to the theme list on success.
 */
export async function createThemeAction(formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  const parsed = themeSchema.safeParse(readThemeForm(formData));
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const d = parsed.data;

  let articles: ReturnType<typeof readArticles>;
  try {
    articles = readArticles(formData);
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Artigo inválido." };
  }

  const themeName = d.name;
  let summary = (d.summary ?? "").trim();
  for (const article of articles) {
    summary = await enrichThemeSummary({
      themeName,
      currentSummary: summary,
      article: { title: article.title, originalUrl: article.originalUrl },
    });
  }

  const dimensions = buildDimensions(d.economic, d.social);

  await db.theme.create({
    data: {
      kid: kid("thm"),
      name: themeName,
      summary,
      scope: d.scope,
      state: emptyToNull(d.state),
      municipality: emptyToNull(d.municipality),
      ...(dimensions !== undefined ? { dimensions } : {}),
      articles: {
        create: articles.map((a) => ({
          kid: kid("art"),
          title: a.title,
          originalUrl: a.originalUrl,
          downloadUrl: a.downloadUrl,
        })),
      },
    },
  });

  revalidatePath(LIST_PATH);
  redirect(LIST_PATH);
}

/**
 * Update a theme's metadata and add any newly submitted articles (existing
 * articles are preserved). Each new article re-enriches the summary.
 */
export async function updateThemeAction(
  themeKid: string,
  formData: FormData,
): Promise<ActionResult> {
  await requireAdmin();
  const parsed = themeSchema.safeParse(readThemeForm(formData));
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const d = parsed.data;

  const theme = await db.theme.findUnique({
    where: { kid: themeKid },
    select: { id: true, name: true },
  });
  if (!theme) return { ok: false, message: "Tema não encontrado." };

  let newArticles: ReturnType<typeof readArticles>;
  try {
    newArticles = readArticles(formData);
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Artigo inválido." };
  }

  let summary = (d.summary ?? "").trim();
  for (const article of newArticles) {
    summary = await enrichThemeSummary({
      themeName: d.name,
      currentSummary: summary,
      article: { title: article.title, originalUrl: article.originalUrl },
    });
  }

  const dimensions = buildDimensions(d.economic, d.social);

  await db.theme.update({
    where: { kid: themeKid },
    data: {
      name: d.name,
      summary,
      scope: d.scope,
      state: emptyToNull(d.state),
      municipality: emptyToNull(d.municipality),
      dimensions: dimensions === undefined ? Prisma.JsonNull : dimensions,
      ...(newArticles.length > 0
        ? {
            articles: {
              create: newArticles.map((a) => ({
                kid: kid("art"),
                title: a.title,
                originalUrl: a.originalUrl,
                downloadUrl: a.downloadUrl,
              })),
            },
          }
        : {}),
    },
  });

  revalidatePath(LIST_PATH);
  redirect(LIST_PATH);
}

/**
 * Remove a single article from a theme, identified by its public `kid`.
 */
export async function deleteArticleAction(
  articleKid: string,
  themeKid: string,
): Promise<ActionResult> {
  await requireAdmin();
  await db.article.delete({ where: { kid: articleKid } }).catch(() => undefined);
  revalidatePath(`/admin/temas/${themeKid}`);
  return { ok: true };
}

/**
 * Toggle a theme between ACTIVE and BLOCKED status.
 */
export async function toggleThemeStatusAction(themeKid: string): Promise<ActionResult> {
  await requireAdmin();
  const theme = await db.theme.findUnique({ where: { kid: themeKid }, select: { status: true } });
  if (!theme) return { ok: false, message: "Tema não encontrado." };
  await db.theme.update({
    where: { kid: themeKid },
    data: { status: theme.status === "ACTIVE" ? "BLOCKED" : "ACTIVE" },
  });
  revalidatePath(LIST_PATH);
  return { ok: true };
}

/**
 * Delete a theme. Falls back to blocking it when deletion is not possible
 * (e.g. votes still reference it).
 */
export async function deleteThemeAction(themeKid: string): Promise<ActionResult> {
  await requireAdmin();
  try {
    await db.theme.delete({ where: { kid: themeKid } });
    revalidatePath(LIST_PATH);
    return { ok: true, message: "Tema excluído." };
  } catch {
    await db.theme
      .update({ where: { kid: themeKid }, data: { status: "BLOCKED" } })
      .catch(() => undefined);
    revalidatePath(LIST_PATH);
    return {
      ok: false,
      message: "Não foi possível excluir (há votos vinculados). O tema foi bloqueado.",
    };
  }
}
