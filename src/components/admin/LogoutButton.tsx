"use client";

/**
 * Logout control: submits the logoutAction which clears the admin session and
 * redirects to the login page.
 */
import { logoutAction } from "@/lib/actions/admin/auth";
import { Button } from "@/components/ui";

export function LogoutButton() {
  return (
    <form action={logoutAction}>
      <Button type="submit" variant="outline" size="sm">
        Sair
      </Button>
    </form>
  );
}
