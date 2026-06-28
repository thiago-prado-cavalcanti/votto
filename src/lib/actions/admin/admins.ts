"use server";

/**
 * Server actions for managing administrators (Administrator).
 */
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { kid } from "@/lib/ids";
import { requireAdmin } from "@/lib/auth/guards";
import { hashPassword } from "@/lib/auth/password";
import type { AdminRole } from "@/generated/prisma";

export interface ActionResult {
  ok: boolean;
  message?: string;
}

const LIST_PATH = "/admin/administradores";

const ROLES: [AdminRole, ...AdminRole[]] = ["SUPER_ADMIN", "EDITOR", "VIEWER"];

const baseSchema = z.object({
  firstName: z.string().trim().min(1, "Informe o nome."),
  lastName: z.string().trim().min(1, "Informe o sobrenome."),
  email: z.string().trim().email("E-mail inválido."),
  mobile: z.string().trim().optional().or(z.literal("")),
  imageUrl: z.string().trim().url("URL da imagem inválida.").optional().or(z.literal("")),
  role: z.enum(ROLES),
});

function emptyToNull(value: unknown): string | null {
  const v = (value ?? "").toString().trim();
  return v.length === 0 ? null : v;
}

function readForm(formData: FormData) {
  return {
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    email: formData.get("email"),
    mobile: formData.get("mobile"),
    imageUrl: formData.get("imageUrl"),
    role: formData.get("role"),
  };
}

/**
 * Create a new administrator with a hashed password.
 */
export async function createAdminAction(formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  const parsed = baseSchema.safeParse(readForm(formData));
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const password = (formData.get("password") ?? "").toString();
  if (password.length < 8) {
    return { ok: false, message: "A senha deve ter ao menos 8 caracteres." };
  }
  const d = parsed.data;
  const email = d.email.toLowerCase();

  const existing = await db.administrator.findUnique({ where: { email }, select: { id: true } });
  if (existing) return { ok: false, message: "Já existe um administrador com este e-mail." };

  await db.administrator.create({
    data: {
      kid: kid("adm"),
      firstName: d.firstName,
      lastName: d.lastName,
      email,
      mobile: emptyToNull(d.mobile),
      imageUrl: emptyToNull(d.imageUrl),
      role: d.role,
      passwordHash: await hashPassword(password),
    },
  });

  revalidatePath(LIST_PATH);
  redirect(LIST_PATH);
}

/**
 * Update an administrator identified by its public `kid`. The password is only
 * re-hashed and stored when a non-empty value is provided.
 */
export async function updateAdminAction(
  adminKid: string,
  formData: FormData,
): Promise<ActionResult> {
  await requireAdmin();
  const parsed = baseSchema.safeParse(readForm(formData));
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const d = parsed.data;
  const email = d.email.toLowerCase();

  const existing = await db.administrator.findUnique({ where: { kid: adminKid }, select: { id: true } });
  if (!existing) return { ok: false, message: "Administrador não encontrado." };

  const byEmail = await db.administrator.findUnique({ where: { email }, select: { id: true } });
  if (byEmail && byEmail.id !== existing.id) {
    return { ok: false, message: "Já existe um administrador com este e-mail." };
  }

  const password = (formData.get("password") ?? "").toString();
  let passwordHash: string | undefined;
  if (password.length > 0) {
    if (password.length < 8) return { ok: false, message: "A senha deve ter ao menos 8 caracteres." };
    passwordHash = await hashPassword(password);
  }

  await db.administrator.update({
    where: { kid: adminKid },
    data: {
      firstName: d.firstName,
      lastName: d.lastName,
      email,
      mobile: emptyToNull(d.mobile),
      imageUrl: emptyToNull(d.imageUrl),
      role: d.role,
      ...(passwordHash ? { passwordHash } : {}),
    },
  });

  revalidatePath(LIST_PATH);
  redirect(LIST_PATH);
}

/**
 * Toggle an administrator between ACTIVE and BLOCKED status.
 */
export async function toggleAdminStatusAction(adminKid: string): Promise<ActionResult> {
  await requireAdmin();
  const admin = await db.administrator.findUnique({
    where: { kid: adminKid },
    select: { status: true },
  });
  if (!admin) return { ok: false, message: "Administrador não encontrado." };
  await db.administrator.update({
    where: { kid: adminKid },
    data: { status: admin.status === "ACTIVE" ? "BLOCKED" : "ACTIVE" },
  });
  revalidatePath(LIST_PATH);
  return { ok: true };
}

/**
 * Delete an administrator. Falls back to blocking it when deletion is not
 * possible.
 */
export async function deleteAdminAction(adminKid: string): Promise<ActionResult> {
  await requireAdmin();
  try {
    await db.administrator.delete({ where: { kid: adminKid } });
    revalidatePath(LIST_PATH);
    return { ok: true, message: "Administrador excluído." };
  } catch {
    await db.administrator
      .update({ where: { kid: adminKid }, data: { status: "BLOCKED" } })
      .catch(() => undefined);
    revalidatePath(LIST_PATH);
    return {
      ok: false,
      message: "Não foi possível excluir. O administrador foi bloqueado.",
    };
  }
}
