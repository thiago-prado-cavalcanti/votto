/**
 * Edit an existing public agent.
 */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/admin/PageHeader";
import { AgentForm, type AgentFormValues, type PartyOption } from "@/components/admin/AgentForm";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Editar agente" };

export default async function EditAgentPage({
  params,
}: {
  params: Promise<{ kid: string }>;
}) {
  const { kid } = await params;

  const [agent, parties] = await Promise.all([
    db.publicAgent.findUnique({
      where: { kid },
      include: { party: { select: { kid: true } } },
    }),
    db.party.findMany({
      where: { status: "ACTIVE" },
      orderBy: { name: "asc" },
      select: { kid: true, name: true, acronym: true },
    }),
  ]);

  if (!agent) notFound();

  const values: AgentFormValues = {
    kid: agent.kid,
    firstName: agent.firstName,
    lastName: agent.lastName,
    email: agent.email,
    phone: agent.phone,
    imageUrl: agent.imageUrl,
    description: agent.description,
    type: agent.type,
    state: agent.state,
    municipality: agent.municipality,
    partyKid: agent.party?.kid ?? null,
  };

  return (
    <div>
      <PageHeader title="Editar agente" description={`${agent.firstName} ${agent.lastName}`} />
      <AgentForm agent={values} parties={parties as PartyOption[]} />
    </div>
  );
}
