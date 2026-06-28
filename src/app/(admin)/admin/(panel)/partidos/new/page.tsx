/**
 * Create a new party.
 */
import type { Metadata } from "next";
import { PageHeader } from "@/components/admin/PageHeader";
import { PartyForm } from "@/components/admin/PartyForm";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Novo partido" };

export default function NewPartyPage() {
  return (
    <div>
      <PageHeader title="Novo partido" description="Cadastre um novo partido político." />
      <PartyForm />
    </div>
  );
}
