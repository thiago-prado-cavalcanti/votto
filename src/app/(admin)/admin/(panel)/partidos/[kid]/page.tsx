/**
 * Edit an existing party.
 */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/admin/PageHeader";
import { PartyForm, type PartyFormValues } from "@/components/admin/PartyForm";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Editar partido" };

export default async function EditPartyPage({
  params,
}: {
  params: Promise<{ kid: string }>;
}) {
  const { kid } = await params;
  const party = await db.party.findUnique({ where: { kid } });
  if (!party) notFound();

  const values: PartyFormValues = {
    kid: party.kid,
    name: party.name,
    acronym: party.acronym,
    description: party.description,
    logoUrl: party.logoUrl,
  };

  return (
    <div>
      <PageHeader title="Editar partido" description={party.name} />
      <PartyForm party={values} />
    </div>
  );
}
