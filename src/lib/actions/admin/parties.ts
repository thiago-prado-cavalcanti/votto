"use server";

/**
 * Server actions for managing political parties (Party).
 */
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { kid } from "@/lib/ids";
import { requireAdmin } from "@/lib/auth/guards";

export interface ActionResult {
  ok: boolean;
  message?: string;
}

const LIST_PATH = "/admin/partidos";

const partySchema = z.object({
  name: z.string().trim().min(1, "Informe o nome do partido."),
  acronym: z.string().trim().optional().nullable(),
  description: z.string().trim().optional().nullable(),
  logoUrl: z
    .string()
    .trim()
    .url("URL do logo inválida.")
    .optional()
    .or(z.literal("")),
});

function readForm(formData: FormData) {
  return {
    name: formData.get("name"),
    acronym: formData.get("acronym"),
    description: formData.get("description"),
    logoUrl: formData.get("logoUrl"),
  };
}

function emptyToNull(value: string | null | undefined): string | null {
  const v = (value ?? "").toString().trim();
  return v.length === 0 ? null : v;
}

/**
 * Create a new party, then redirect back to the party list.
 */
export async function createPartyAction(formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  const parsed = partySchema.safeParse(readForm(formData));
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const d = parsed.data;
  await db.party.create({
    data: {
      kid: kid("pty"),
      name: d.name,
      acronym: emptyToNull(d.acronym),
      description: emptyToNull(d.description),
      logoUrl: emptyToNull(d.logoUrl),
    },
  });
  revalidatePath(LIST_PATH);
  redirect(LIST_PATH);
}

/**
 * Update an existing party identified by its public `kid`.
 */
export async function updatePartyAction(
  partyKid: string,
  formData: FormData,
): Promise<ActionResult> {
  await requireAdmin();
  const parsed = partySchema.safeParse(readForm(formData));
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const d = parsed.data;
  await db.party.update({
    where: { kid: partyKid },
    data: {
      name: d.name,
      acronym: emptyToNull(d.acronym),
      description: emptyToNull(d.description),
      logoUrl: emptyToNull(d.logoUrl),
    },
  });
  revalidatePath(LIST_PATH);
  redirect(LIST_PATH);
}

/**
 * Toggle a party between ACTIVE and BLOCKED status.
 */
export async function togglePartyStatusAction(partyKid: string): Promise<ActionResult> {
  await requireAdmin();
  const party = await db.party.findUnique({ where: { kid: partyKid }, select: { status: true } });
  if (!party) return { ok: false, message: "Partido não encontrado." };
  await db.party.update({
    where: { kid: partyKid },
    data: { status: party.status === "ACTIVE" ? "BLOCKED" : "ACTIVE" },
  });
  revalidatePath(LIST_PATH);
  return { ok: true };
}

/**
 * Delete a party. Falls back to blocking it when deletion is not possible
 * (e.g. agents still reference it).
 */
export async function deletePartyAction(partyKid: string): Promise<ActionResult> {
  await requireAdmin();
  try {
    await db.party.delete({ where: { kid: partyKid } });
    revalidatePath(LIST_PATH);
    return { ok: true, message: "Partido excluído." };
  } catch {
    await db.party
      .update({ where: { kid: partyKid }, data: { status: "BLOCKED" } })
      .catch(() => undefined);
    revalidatePath(LIST_PATH);
    return {
      ok: false,
      message: "Não foi possível excluir (há registros vinculados). O partido foi bloqueado.",
    };
  }
}
