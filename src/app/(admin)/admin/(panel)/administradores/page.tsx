/**
 * Administrators list. passwordHash is never selected/rendered.
 */
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { ButtonLink, Badge } from "@/components/ui";
import { PageHeader } from "@/components/admin/PageHeader";
import { DataTable, type Column } from "@/components/admin/DataTable";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { AdminRowActions } from "@/components/admin/AdminRowActions";
import type { AdminRole, EntityStatus } from "@/generated/prisma";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Administradores" };

interface AdminRow {
  kid: string;
  firstName: string;
  lastName: string;
  email: string;
  role: AdminRole;
  status: EntityStatus;
}

const roleLabel: Record<AdminRole, string> = {
  SUPER_ADMIN: "Super administrador",
  EDITOR: "Editor",
  VIEWER: "Visualizador",
};

export default async function AdminsListPage() {
  const admins = await db.administrator.findMany({
    orderBy: { createdAt: "desc" },
    select: { kid: true, firstName: true, lastName: true, email: true, role: true, status: true },
  });

  const columns: Column<AdminRow>[] = [
    {
      header: "Nome",
      cell: (a) => (
        <span className="font-medium text-navy-900">
          {a.firstName} {a.lastName}
        </span>
      ),
    },
    { header: "E-mail", cell: (a) => a.email },
    { header: "Papel", cell: (a) => <Badge tone="navy">{roleLabel[a.role]}</Badge> },
    { header: "Status", cell: (a) => <StatusBadge status={a.status} /> },
    {
      header: "Ações",
      className: "text-right",
      cell: (a) => <AdminRowActions adminKid={a.kid} status={a.status} />,
    },
  ];

  return (
    <div>
      <PageHeader
        title="Administradores"
        description="Gerencie o acesso ao painel administrativo."
        action={<ButtonLink href="/admin/administradores/new">Novo administrador</ButtonLink>}
      />
      <DataTable columns={columns} rows={admins} getKey={(a) => a.kid} />
    </div>
  );
}
