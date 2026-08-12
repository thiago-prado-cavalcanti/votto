"use client";

/**
 * Create/edit form for an Administrator. The password field is required on
 * create and optional on edit (only changed when filled). passwordHash is never
 * rendered.
 */
import * as React from "react";
import { Card, CardBody, Field, Input, Select, ButtonLink } from "@/components/ui";
import { SubmitButton } from "@/components/admin/SubmitButton";
import {
  createAdminAction,
  updateAdminAction,
  type ActionResult,
} from "@/lib/actions/admin/admins";
import type { AdminRole } from "@/generated/prisma";

const ROLES: { value: AdminRole; label: string }[] = [
  { value: "SUPER_ADMIN", label: "Super administrador" },
  { value: "EDITOR", label: "Editor" },
  { value: "VIEWER", label: "Visualizador" },
];

export interface AdminFormValues {
  kid: string;
  firstName: string;
  lastName: string;
  email: string;
  mobile: string | null;
  imageUrl: string | null;
  role: AdminRole;
}

export function AdminForm({ admin }: { admin?: AdminFormValues }) {
  const [error, setError] = React.useState<string | null>(null);

  async function action(formData: FormData) {
    setError(null);
    const res: ActionResult = admin
      ? await updateAdminAction(admin.kid, formData)
      : await createAdminAction(formData);
    if (!res.ok && res.message) setError(res.message);
  }

  return (
    <Card>
      <CardBody>
        <form action={action} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nome" htmlFor="firstName">
              <Input id="firstName" name="firstName" required defaultValue={admin?.firstName ?? ""} />
            </Field>
            <Field label="Sobrenome" htmlFor="lastName">
              <Input id="lastName" name="lastName" required defaultValue={admin?.lastName ?? ""} />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="E-mail" htmlFor="email">
              <Input id="email" name="email" type="email" required defaultValue={admin?.email ?? ""} />
            </Field>
            <Field label="Celular" htmlFor="mobile">
              <Input id="mobile" name="mobile" defaultValue={admin?.mobile ?? ""} />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Papel" htmlFor="role">
              <Select id="role" name="role" defaultValue={admin?.role ?? "EDITOR"}>
                {ROLES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field
              label="Senha"
              htmlFor="password"
              hint={admin ? "Deixe em branco para manter a senha atual." : "Mínimo de 8 caracteres."}
            >
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                required={!admin}
              />
            </Field>
          </div>

          <Field label="URL da imagem" htmlFor="imageUrl">
            <Input id="imageUrl" name="imageUrl" type="url" defaultValue={admin?.imageUrl ?? ""} placeholder="https://..." />
          </Field>

          {error ? (
            <p className="rounded-card bg-[#f7e9e4] px-3.5 py-2.5 text-sm text-[var(--color-negative)]">{error}</p>
          ) : null}

          <div className="flex items-center gap-2">
            <SubmitButton>{admin ? "Salvar alterações" : "Criar administrador"}</SubmitButton>
            <ButtonLink href="/admin/administradores" variant="outline">
              Cancelar
            </ButtonLink>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}
