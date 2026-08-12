"use client";

/**
 * Create/edit form for a Theme. Supports editing scope/state/municipality,
 * positioning dimensions (economic/social), and adding MULTIPLE new articles in
 * one submission. Existing articles can be removed individually (edit mode).
 */
import * as React from "react";
import { useRouter } from "next/navigation";
import { Card, CardBody, Field, Input, Textarea, Select, Button, ButtonLink } from "@/components/ui";
import { SubmitButton } from "@/components/admin/SubmitButton";
import {
  createThemeAction,
  updateThemeAction,
  deleteArticleAction,
  type ActionResult,
} from "@/lib/actions/admin/themes";
import { scopeLabel, BR_STATES } from "@/lib/labels";
import type { Scope } from "@/generated/prisma";

const SCOPES: Scope[] = ["NATIONAL", "STATE", "MUNICIPAL"];

export interface ExistingArticle {
  kid: string;
  title: string | null;
  originalUrl: string;
  downloadUrl: string | null;
}

export interface ThemeFormValues {
  kid: string;
  name: string;
  summary: string;
  description: string;
  viewpoints: { right?: string; center?: string; left?: string } | null;
  scope: Scope;
  state: string | null;
  municipality: string | null;
  economic: number | null;
  social: number | null;
  articles: ExistingArticle[];
}

interface NewArticleRow {
  id: number;
}

export function ThemeForm({ theme, aiEnabled }: { theme?: ThemeFormValues; aiEnabled: boolean }) {
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);
  const [rows, setRows] = React.useState<NewArticleRow[]>([]);
  const nextId = React.useRef(1);
  const [removing, startRemove] = React.useTransition();

  function addRow() {
    setRows((r) => [...r, { id: nextId.current++ }]);
  }
  function removeRow(id: number) {
    setRows((r) => r.filter((row) => row.id !== id));
  }

  async function action(formData: FormData) {
    setError(null);
    const res: ActionResult = theme
      ? await updateThemeAction(theme.kid, formData)
      : await createThemeAction(formData);
    if (!res.ok && res.message) setError(res.message);
  }

  function removeExisting(articleKid: string) {
    if (!theme) return;
    if (!window.confirm("Remover este artigo do tema?")) return;
    startRemove(async () => {
      await deleteArticleAction(articleKid, theme.kid);
      router.refresh();
    });
  }

  return (
    <Card>
      <CardBody>
        <form action={action} className="space-y-5">
          <Field label="Nome do tema" htmlFor="name">
            <Input id="name" name="name" required defaultValue={theme?.name ?? ""} />
          </Field>

          <Field
            label="Resumo"
            htmlFor="summary"
            hint={
              aiEnabled
                ? "Será aprimorado por IA a cada artigo adicionado."
                : "IA desativada: artigos adicionados serão anexados ao resumo."
            }
          >
            <Textarea id="summary" name="summary" defaultValue={theme?.summary ?? ""} className="min-h-24" />
          </Field>

          <Field
            label="Descrição completa"
            htmlFor="description"
            hint="Texto longo (2+ parágrafos). Separe parágrafos com uma linha em branco."
          >
            <Textarea
              id="description"
              name="description"
              defaultValue={theme?.description ?? ""}
              className="min-h-40"
            />
          </Field>

          <fieldset className="rounded-card border border-line p-4">
            <legend className="px-1 text-sm font-semibold text-navy-800">
              Pontos de vista
            </legend>
            <div className="grid gap-4">
              <Field label="Visão à esquerda" htmlFor="viewpointLeft">
                <Textarea
                  id="viewpointLeft"
                  name="viewpointLeft"
                  defaultValue={theme?.viewpoints?.left ?? ""}
                  className="min-h-20"
                />
              </Field>
              <Field label="Visão ao centro" htmlFor="viewpointCenter">
                <Textarea
                  id="viewpointCenter"
                  name="viewpointCenter"
                  defaultValue={theme?.viewpoints?.center ?? ""}
                  className="min-h-20"
                />
              </Field>
              <Field label="Visão à direita" htmlFor="viewpointRight">
                <Textarea
                  id="viewpointRight"
                  name="viewpointRight"
                  defaultValue={theme?.viewpoints?.right ?? ""}
                  className="min-h-20"
                />
              </Field>
            </div>
          </fieldset>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Abrangência" htmlFor="scope">
              <Select id="scope" name="scope" defaultValue={theme?.scope ?? "NATIONAL"}>
                {SCOPES.map((s) => (
                  <option key={s} value={s}>
                    {scopeLabel[s]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Estado (UF)" htmlFor="state">
              <Select id="state" name="state" defaultValue={theme?.state ?? ""}>
                <option value="">—</option>
                {BR_STATES.map((uf) => (
                  <option key={uf} value={uf}>
                    {uf}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Município" htmlFor="municipality">
              <Input id="municipality" name="municipality" defaultValue={theme?.municipality ?? ""} />
            </Field>
          </div>

          <fieldset className="rounded-card border border-line p-4">
            <legend className="px-1 text-sm font-medium text-navy-800">Posicionamento (-1 a 1)</legend>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Eixo econômico" htmlFor="economic" hint="-1 (estatista) a 1 (liberal)">
                <Input
                  id="economic"
                  name="economic"
                  type="number"
                  step="0.01"
                  min={-1}
                  max={1}
                  defaultValue={theme?.economic ?? ""}
                />
              </Field>
              <Field label="Eixo social" htmlFor="social" hint="-1 (progressista) a 1 (conservador)">
                <Input
                  id="social"
                  name="social"
                  type="number"
                  step="0.01"
                  min={-1}
                  max={1}
                  defaultValue={theme?.social ?? ""}
                />
              </Field>
            </div>
          </fieldset>

          {theme && theme.articles.length > 0 ? (
            <div>
              <h3 className="mb-2 text-sm font-medium text-navy-800">Artigos atuais</h3>
              <ul className="space-y-2">
                {theme.articles.map((a) => (
                  <li
                    key={a.kid}
                    className="flex items-center justify-between gap-3 rounded-card border border-line px-3.5 py-2.5"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-ink">{a.title ?? a.originalUrl}</p>
                      <a
                        href={a.originalUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="truncate text-xs text-navy-500 hover:underline"
                      >
                        {a.originalUrl}
                      </a>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeExisting(a.kid)}
                      disabled={removing}
                    >
                      Remover
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-medium text-navy-800">Novos artigos</h3>
              <Button type="button" variant="outline" size="sm" onClick={addRow}>
                Adicionar artigo
              </Button>
            </div>
            {rows.length === 0 ? (
              <p className="text-sm text-[var(--color-muted)]">Nenhum artigo novo. Clique em “Adicionar artigo”.</p>
            ) : (
              <div className="space-y-3">
                {rows.map((row) => (
                  <div key={row.id} className="rounded-card border border-line p-3.5">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="Título" htmlFor={`articleTitle-${row.id}`}>
                        <Input id={`articleTitle-${row.id}`} name="articleTitle" />
                      </Field>
                      <Field label="URL original" htmlFor={`articleOriginalUrl-${row.id}`}>
                        <Input
                          id={`articleOriginalUrl-${row.id}`}
                          name="articleOriginalUrl"
                          type="url"
                          placeholder="https://..."
                        />
                      </Field>
                      <Field label="URL de download" htmlFor={`articleDownloadUrl-${row.id}`}>
                        <Input
                          id={`articleDownloadUrl-${row.id}`}
                          name="articleDownloadUrl"
                          type="url"
                          placeholder="https://..."
                        />
                      </Field>
                    </div>
                    <div className="mt-2 flex justify-end">
                      <Button type="button" variant="ghost" size="sm" onClick={() => removeRow(row.id)}>
                        Remover linha
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {error ? (
            <p className="rounded-card bg-[#f7e9e4] px-3.5 py-2.5 text-sm text-[var(--color-negative)]">{error}</p>
          ) : null}

          <div className="flex items-center gap-2">
            <SubmitButton pendingLabel={aiEnabled ? "Processando IA..." : "Salvando..."}>
              {theme ? "Salvar alterações" : "Criar tema"}
            </SubmitButton>
            <ButtonLink href="/admin/temas" variant="outline">
              Cancelar
            </ButtonLink>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}
