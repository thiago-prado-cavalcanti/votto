"use client";

/**
 * Create/edit form for a Party. Binds to either createPartyAction or
 * updatePartyAction depending on whether an existing party is provided.
 */
import * as React from "react";
import { Card, CardBody, Field, Input, Textarea, ButtonLink } from "@/components/ui";
import { SubmitButton } from "@/components/admin/SubmitButton";
import {
  createPartyAction,
  updatePartyAction,
  type ActionResult,
} from "@/lib/actions/admin/parties";

export interface PartyFormValues {
  kid: string;
  name: string;
  acronym: string | null;
  description: string | null;
  logoUrl: string | null;
}

export function PartyForm({ party }: { party?: PartyFormValues }) {
  const [error, setError] = React.useState<string | null>(null);

  async function action(formData: FormData) {
    setError(null);
    const res: ActionResult = party
      ? await updatePartyAction(party.kid, formData)
      : await createPartyAction(formData);
    if (!res.ok && res.message) setError(res.message);
  }

  return (
    <Card>
      <CardBody>
        <form action={action} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nome" htmlFor="name">
              <Input id="name" name="name" required defaultValue={party?.name ?? ""} />
            </Field>
            <Field label="Sigla" htmlFor="acronym">
              <Input id="acronym" name="acronym" defaultValue={party?.acronym ?? ""} />
            </Field>
          </div>
          <Field label="Descrição" htmlFor="description">
            <Textarea id="description" name="description" defaultValue={party?.description ?? ""} />
          </Field>
          <Field label="URL do logo" htmlFor="logoUrl">
            <Input id="logoUrl" name="logoUrl" type="url" defaultValue={party?.logoUrl ?? ""} placeholder="https://..." />
          </Field>

          {error ? (
            <p className="rounded-xl bg-[#fbeaeb] px-3.5 py-2.5 text-sm text-[var(--color-negative)]">{error}</p>
          ) : null}

          <div className="flex items-center gap-2">
            <SubmitButton>{party ? "Salvar alterações" : "Criar partido"}</SubmitButton>
            <ButtonLink href="/admin/partidos" variant="outline">
              Cancelar
            </ButtonLink>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}
