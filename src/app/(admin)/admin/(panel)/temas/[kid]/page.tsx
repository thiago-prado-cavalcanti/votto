/**
 * Edit an existing theme, manage its articles, and adjust positioning.
 */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/admin/PageHeader";
import { ThemeForm, type ThemeFormValues } from "@/components/admin/ThemeForm";
import { isAiEnabled } from "@/lib/env";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Editar tema" };

/** Safely read a numeric dimension from the theme's JSON `dimensions` field. */
function readDimension(dimensions: unknown, key: string): number | null {
  if (dimensions && typeof dimensions === "object" && !Array.isArray(dimensions)) {
    const v = (dimensions as Record<string, unknown>)[key];
    if (typeof v === "number" && Number.isFinite(v)) return v;
  }
  return null;
}

export default async function EditThemePage({
  params,
}: {
  params: Promise<{ kid: string }>;
}) {
  const { kid } = await params;
  const theme = await db.theme.findUnique({
    where: { kid },
    include: { articles: { orderBy: { createdAt: "asc" } } },
  });
  if (!theme) notFound();

  const values: ThemeFormValues = {
    kid: theme.kid,
    name: theme.name,
    summary: theme.summary,
    scope: theme.scope,
    state: theme.state,
    municipality: theme.municipality,
    economic: readDimension(theme.dimensions, "economic"),
    social: readDimension(theme.dimensions, "social"),
    articles: theme.articles.map((a) => ({
      kid: a.kid,
      title: a.title,
      originalUrl: a.originalUrl,
      downloadUrl: a.downloadUrl,
    })),
  };

  return (
    <div>
      <PageHeader title="Editar tema" description={theme.name} />
      <ThemeForm theme={values} aiEnabled={isAiEnabled()} />
    </div>
  );
}
