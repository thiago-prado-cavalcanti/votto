/**
 * Themes list.
 */
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { ButtonLink } from "@/components/ui";
import { PageHeader } from "@/components/admin/PageHeader";
import { DataTable, type Column } from "@/components/admin/DataTable";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { ThemeRowActions } from "@/components/admin/ThemeRowActions";
import { toPublicTheme, type PublicTheme } from "@/lib/dto";
import { scopeLabel } from "@/lib/labels";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Temas" };

export default async function ThemesListPage() {
  const rows = await db.theme.findMany({ orderBy: { createdAt: "desc" } });
  const themes = rows.map((t) => toPublicTheme(t));

  const columns: Column<PublicTheme>[] = [
    {
      header: "Tema",
      cell: (t) => <span className="font-medium text-navy-900">{t.name}</span>,
    },
    { header: "Abrangência", cell: (t) => scopeLabel[t.scope] },
    { header: "Votos", cell: (t) => t.totalVotes.toLocaleString("pt-BR") },
    { header: "Status", cell: (t) => <StatusBadge status={t.status} /> },
    {
      header: "Ações",
      className: "text-right",
      cell: (t) => <ThemeRowActions themeKid={t.kid} status={t.status} />,
    },
  ];

  return (
    <div>
      <PageHeader
        title="Temas"
        description="Gerencie pautas, projetos e leis em votação."
        action={<ButtonLink href="/admin/temas/new">Novo tema</ButtonLink>}
      />
      <DataTable columns={columns} rows={themes} getKey={(t) => t.kid} />
    </div>
  );
}
