"use server";

/**
 * Citizen authentication server actions for the public area.
 *
 * Login itself is performed via an official identity provider (mock gov.br in the
 * dev IdP) through the `/api/auth/govbr/*` routes; this module only exposes the
 * logout action used by the public layout.
 */
import { redirect } from "next/navigation";
import { clearCitizenSession } from "@/lib/auth/session";

/**
 * Clear the citizen session and return to the public home page.
 * Wired to the "Sair" button in the public layout.
 */
export async function logoutCitizenAction(): Promise<void> {
  await clearCitizenSession();
  redirect("/");
}
