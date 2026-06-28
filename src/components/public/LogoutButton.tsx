/**
 * Inline logout form for the public header. Submits to the citizen logout server
 * action (no client JS required).
 */
import { logoutCitizenAction } from "@/lib/actions/citizen-auth";

export function LogoutButton() {
  return (
    <form action={logoutCitizenAction}>
      <button
        type="submit"
        className="text-sm font-medium text-navy-700 hover:text-navy-900"
      >
        Sair
      </button>
    </form>
  );
}
