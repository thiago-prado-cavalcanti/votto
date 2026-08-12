"use client";

/**
 * Create/edit form for a PublicAgent. Binds to createAgentAction or
 * updateAgentAction depending on whether an existing agent is provided.
 */
import * as React from "react";
import { Card, CardBody, Field, Input, Textarea, Select, ButtonLink } from "@/components/ui";
import { SubmitButton } from "@/components/admin/SubmitButton";
import {
  createAgentAction,
  updateAgentAction,
  type ActionResult,
} from "@/lib/actions/admin/agents";
import { agentTypeLabel, BR_STATES } from "@/lib/labels";
import type { AgentType } from "@/generated/prisma";

const AGENT_TYPES: AgentType[] = [
  "FEDERAL_DEPUTY",
  "STATE_DEPUTY",
  "COUNCILLOR",
  "SENATOR",
  "GOVERNOR",
  "MAYOR",
  "PRESIDENT",
];

export interface AgentFormValues {
  kid: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  imageUrl: string | null;
  description: string | null;
  type: AgentType;
  state: string | null;
  municipality: string | null;
  partyKid: string | null;
}

export interface PartyOption {
  kid: string;
  name: string;
  acronym: string | null;
}

export function AgentForm({
  agent,
  parties,
}: {
  agent?: AgentFormValues;
  parties: PartyOption[];
}) {
  const [error, setError] = React.useState<string | null>(null);

  async function action(formData: FormData) {
    setError(null);
    const res: ActionResult = agent
      ? await updateAgentAction(agent.kid, formData)
      : await createAgentAction(formData);
    if (!res.ok && res.message) setError(res.message);
  }

  return (
    <Card>
      <CardBody>
        <form action={action} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nome" htmlFor="firstName">
              <Input id="firstName" name="firstName" required defaultValue={agent?.firstName ?? ""} />
            </Field>
            <Field label="Sobrenome" htmlFor="lastName">
              <Input id="lastName" name="lastName" required defaultValue={agent?.lastName ?? ""} />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="E-mail" htmlFor="email">
              <Input id="email" name="email" type="email" defaultValue={agent?.email ?? ""} />
            </Field>
            <Field label="Telefone" htmlFor="phone">
              <Input id="phone" name="phone" defaultValue={agent?.phone ?? ""} />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Cargo" htmlFor="type">
              <Select id="type" name="type" required defaultValue={agent?.type ?? ""}>
                <option value="" disabled>
                  Selecione...
                </option>
                {AGENT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {agentTypeLabel[t]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Partido" htmlFor="partyKid">
              <Select id="partyKid" name="partyKid" defaultValue={agent?.partyKid ?? ""}>
                <option value="">Sem partido</option>
                {parties.map((p) => (
                  <option key={p.kid} value={p.kid}>
                    {p.acronym ? `${p.acronym} — ${p.name}` : p.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Estado (UF)" htmlFor="state">
              <Select id="state" name="state" defaultValue={agent?.state ?? ""}>
                <option value="">—</option>
                {BR_STATES.map((uf) => (
                  <option key={uf} value={uf}>
                    {uf}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Município" htmlFor="municipality">
              <Input id="municipality" name="municipality" defaultValue={agent?.municipality ?? ""} />
            </Field>
          </div>

          <Field
            label="CPF"
            htmlFor="cpf"
            hint={agent ? "Preencha apenas para definir/alterar o CPF." : "Opcional."}
          >
            <Input id="cpf" name="cpf" inputMode="numeric" placeholder="000.000.000-00" />
          </Field>

          <Field label="URL da imagem" htmlFor="imageUrl">
            <Input id="imageUrl" name="imageUrl" type="url" defaultValue={agent?.imageUrl ?? ""} placeholder="https://..." />
          </Field>

          <Field label="Descrição" htmlFor="description">
            <Textarea id="description" name="description" defaultValue={agent?.description ?? ""} />
          </Field>

          {error ? (
            <p className="rounded-card bg-[#f7e9e4] px-3.5 py-2.5 text-sm text-[var(--color-negative)]">{error}</p>
          ) : null}

          <div className="flex items-center gap-2">
            <SubmitButton>{agent ? "Salvar alterações" : "Criar agente"}</SubmitButton>
            <ButtonLink href="/admin/agentes" variant="outline">
              Cancelar
            </ButtonLink>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}
