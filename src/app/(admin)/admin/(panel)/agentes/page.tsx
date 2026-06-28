/**
 * Public agents list.
 */
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { ButtonLink } from "@/components/ui";
import { PageHeader } from "@/components/admin/PageHeader";
import { DataTable, type Column } from "@/components/admin/DataTable";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { AgentRowActions } from "@/components/admin/AgentRowActions";
import { agentTypeLabel } from "@/lib/labels";
import { toPublicAgent, type PublicAgentDTO } from "@/lib/dto";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Agentes Públicos" };

export default async function AgentsListPage() {
  const rows = await db.publicAgent.findMany({
    orderBy: { createdAt: "desc" },
    include: { party: true },
  });
  const agents = rows.map(toPublicAgent);

  const columns: Column<PublicAgentDTO>[] = [
    {
      header: "Nome",
      cell: (a) => (
        <span className="font-medium text-navy-900">
          {a.firstName} {a.lastName}
        </span>
      ),
    },
    { header: "Partido", cell: (a) => a.party?.acronym ?? a.party?.name ?? "—" },
    { header: "Cargo", cell: (a) => agentTypeLabel[a.type] },
    { header: "UF", cell: (a) => a.state ?? "—" },
    { header: "Status", cell: (a) => <StatusBadge status={a.status} /> },
    {
      header: "Ações",
      className: "text-right",
      cell: (a) => <AgentRowActions agentKid={a.kid} status={a.status} />,
    },
  ];

  return (
    <div>
      <PageHeader
        title="Agentes Públicos"
        description="Gerencie deputados, senadores, prefeitos e demais agentes."
        action={<ButtonLink href="/admin/agentes/new">Novo agente</ButtonLink>}
      />
      <DataTable columns={columns} rows={agents} getKey={(a) => a.kid} />
    </div>
  );
}
