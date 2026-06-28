/**
 * Route guards for server components / server actions. Redirect to the relevant
 * login when the required session is missing.
 */
import "server-only";
import { redirect } from "next/navigation";
import {
  getAdminSession,
  getCitizenSession,
  type AdminSession,
  type CitizenSession,
} from "@/lib/auth/session";

/** Require an authenticated administrator, else redirect to admin login. */
export async function requireAdmin(): Promise<AdminSession> {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");
  return session;
}

/** Require an authenticated citizen, else redirect to the public login. */
export async function requireCitizen(): Promise<CitizenSession> {
  const session = await getCitizenSession();
  if (!session) redirect("/login");
  return session;
}
