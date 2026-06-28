/**
 * Parties list.
 */
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { ButtonLink } from "@/components/ui";
import { PageHeader } from "@/components/admin/PageHeader";
import { DataTable, type Column } from "@/components/admin/DataTable";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { PartyRowActions } from "@/components/admin/PartyRowActions";
import { toPublicParty, type PublicParty } from "@/lib/dto";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Partidos" };

export default async function PartiesListPage() {
  const rows = await db.party.findMany({ orderBy: { name: "asc" } });
  const parties = rows.map(toPublicParty);

  const columns: Column<PublicParty>[] = [
    {
      header: "Nome",
      cell: (p) => <span className="font-medium text-navy-900">{p.name}</span>,
    },
    { header: "Sigla", cell: (p) => p.acronym ?? "—" },
    { header: "Agentes", cell: (p) => p.agentCount.toLocaleString("pt-BR") },
    { header: "Status", cell: (p) => <StatusBadge status={p.status} /> },
    {
      header: "Ações",
      className: "text-right",
      cell: (p) => <PartyRowActions partyKid={p.kid} status={p.status} />,
    },
  ];

  return (
    <div>
      <PageHeader
        title="Partidos"
        description="Gerencie os partidos políticos."
        action={<ButtonLink href="/admin/partidos/new">Novo partido</ButtonLink>}
      />
      <DataTable columns={columns} rows={parties} getKey={(p) => p.kid} />
    </div>
  );
}
