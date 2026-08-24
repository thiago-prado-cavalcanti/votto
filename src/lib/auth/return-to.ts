/**
 * Where to put the citizen down once they finish signing in.
 *
 * Sign-in is not a destination — it is an interruption. Somebody tapped "Sim"
 * on a bill and was sent to a provider, a CPF form and a registry lookup; when
 * that ends, landing them on the home page asks them to go find the bill again,
 * and most of them will not. The whole flow therefore carries one thing: the
 * path they were on when it started.
 *
 * It travels in a **cookie of its own**, set at
 * `/api/auth/social/{provider}/start`, rather than inside the OIDC `state` or
 * the pending token. Two reasons: `state` is a CSRF value the provider echoes
 * and must stay opaque, and the pending token is a signed identity that already
 * has one job. A cookie also survives the leg where neither exists — an account
 * already linked never mints a pending token at all.
 *
 * **The vote itself does not travel.** Only the address does. Re-casting a
 * stored intention after a redirect would mean the platform recorded a
 * political act the citizen did not perform at the moment it was recorded, and
 * the vote challenge (CLAUDE.md §5) exists precisely to stand between a session
 * and a ballot. They come back to the bill with the ballot in front of them and
 * press the button themselves.
 */
import "server-only";
import { cookies } from "next/headers";

export const RETURN_COOKIE = "votto_return";

/**
 * 30 minutes, matching the pending identity: the two die together, and neither
 * outlives the sign-up it belongs to.
 */
const MAX_AGE = 60 * 30;

/**
 * Whether the string carries a control character, which has no business in a
 * path. Written as a scan rather than a regular expression on purpose: the
 * range can only be spelled with escapes, and an escape mistyped in a security
 * guard fails open and silently.
 */
function hasControlCharacter(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code < 32 || code === 127) return true;
  }
  return false;
}

/**
 * Reduce anything a caller offers to a safe same-site path, or `null`.
 *
 * This is an open-redirect guard, and it is the only reason the value is
 * inspected rather than used. A destination arrives from a query string, which
 * means an attacker can write it: a link to `…/login?next=https://evil.example`
 * that ends with the citizen on `evil.example` — freshly authenticated, primed
 * to trust whatever it shows them — is the classic phishing shape. So the value
 * must be a path on this site and nothing else.
 *
 * Rejected: absolute URLs, the scheme-relative `//host` form that a naive
 * "starts with a slash" check lets straight through, backslashes (some clients
 * normalize them to slashes), and control characters.
 */
export function sanitizeReturnTo(raw: string | null | undefined): string | null {
  if (!raw) return null;
  if (raw.length > 512) return null;
  if (!raw.startsWith("/")) return null;
  if (raw.startsWith("//")) return null;
  if (raw.includes("\\")) return null;
  if (hasControlCharacter(raw)) return null;
  // Sending them back into the sign-in flow would be a loop, not a return.
  if (raw === "/login" || raw.startsWith("/login?") || raw.startsWith("/entrar")) return null;
  return raw;
}

/** Cookie options, exposed for route handlers building their own response. */
export function returnCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: MAX_AGE,
  };
}

/**
 * Read the stored destination, already sanitized, falling back to `/`.
 *
 * Sanitized again on the way out and not only on the way in: the check is
 * cheap, and a guard that runs at exactly one point in the code is a guard some
 * future call site gets added around.
 */
export async function readReturnTo(): Promise<string> {
  const store = await cookies();
  return sanitizeReturnTo(store.get(RETURN_COOKIE)?.value) ?? "/";
}

/** Drop the destination — on arrival, or when the flow is abandoned. */
export async function clearReturnTo(): Promise<void> {
  const store = await cookies();
  store.delete(RETURN_COOKIE);
}
