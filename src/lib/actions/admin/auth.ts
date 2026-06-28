"use server";

/**
 * Admin authentication server actions: login and logout.
 */
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { verifyPassword } from "@/lib/auth/password";
import { setAdminSession, clearAdminSession } from "@/lib/auth/session";

const loginSchema = z.object({
  email: z.string().trim().email("E-mail inválido."),
  password: z.string().min(1, "Informe a senha."),
});

export interface ActionState {
  error?: string;
}

/**
 * Verify administrator credentials and open an admin session.
 * On success redirects to the dashboard; on failure returns an error message.
 */
export async function loginAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const { email, password } = parsed.data;
  const admin = await db.administrator.findUnique({
    where: { email: email.toLowerCase() },
  });

  if (!admin || admin.status !== "ACTIVE") {
    return { error: "Credenciais inválidas ou conta inativa." };
  }

  const ok = await verifyPassword(password, admin.passwordHash);
  if (!ok) {
    return { error: "Credenciais inválidas ou conta inativa." };
  }

  await setAdminSession({
    kind: "admin",
    adminKid: admin.kid,
    role: admin.role,
    name: `${admin.firstName} ${admin.lastName}`.trim(),
  });

  redirect("/admin/dashboard");
}

/**
 * Clear the admin session and return to the login page.
 */
export async function logoutAction(): Promise<void> {
  await clearAdminSession();
  redirect("/admin/login");
}
