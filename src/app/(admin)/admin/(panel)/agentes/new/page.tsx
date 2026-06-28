/**
 * Create a new public agent.
 */
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/admin/PageHeader";
import { AgentForm, type PartyOption } from "@/components/admin/AgentForm";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Novo agente" };

export default async function NewAgentPage() {
  const parties = await db.party.findMany({
    where: { status: "ACTIVE" },
    orderBy: { name: "asc" },
    select: { kid: true, name: true, acronym: true },
  });

  return (
    <div>
      <PageHeader title="Novo agente" description="Cadastre um novo agente público." />
      <AgentForm parties={parties as PartyOption[]} />
    </div>
  );
}
