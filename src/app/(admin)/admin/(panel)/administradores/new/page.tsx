/**
 * Create a new administrator.
 */
import type { Metadata } from "next";
import { PageHeader } from "@/components/admin/PageHeader";
import { AdminForm } from "@/components/admin/AdminForm";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Novo administrador" };

export default function NewAdminPage() {
  return (
    <div>
      <PageHeader title="Novo administrador" description="Cadastre um novo acesso ao painel." />
      <AdminForm />
    </div>
  );
}
