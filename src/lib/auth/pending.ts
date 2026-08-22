/**
 * The half-authenticated state, and the only place it is allowed to exist.
 *
 * A social provider has told us *which account* the person controls, and
 * nothing about *which citizen* they are. That is not enough to create a User —
 * the model is keyed by the CPF hash, and every vote hangs off it — so the
 * social identity waits here while the citizen confirms a CPF.
 *
 * It waits in a signed httpOnly cookie rather than in the database, on purpose:
 *
 *   * **Nothing is stored for someone who abandons the flow.** Minimal data
 *     collection (CLAUDE.md §5) applies hardest to people who never finished
 *     signing up. No row, no cleanup job, no orphan table.
 *   * **The attempt counter rides along.** CPF + birth date is guessable by
 *     brute force, and every guess is a paid request to the registry
 *     (~R$0,24). The counter lives inside the signed token, so a client cannot
 *     reset it by clearing anything a client can reach.
 *
 * The token is signed with the same secret as the session cookies, so it also
 * carries `kind: "pending"` and is rejected anywhere a session is expected —
 * see `readSession` in `./session.ts`.
 */
import "server-only";
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { env } from "@/lib/env";
import type { ProviderKey } from "@/lib/auth/social/providers";

const secret = () => new TextEncoder().encode(env.authSecret);

export const PENDING_COOKIE = "votto_pending";

/**
 * 30 minutes. Long enough to go find a CPF and a birth date, short enough that
 * a shared machine does not hand the next person a live sign-up.
 */
const MAX_AGE = 60 * 30;

/**
 * How many registry lookups one social identity may pay for.
 *
 * Five is a compromise: a citizen who mistypes a birth date twice is not locked
 * out, while someone walking a CPF against candidate dates gets nowhere. Past
 * the limit the flow restarts from the provider, which costs the attacker a
 * full round trip per five guesses.
 */
export const MAX_CPF_ATTEMPTS = 5;

/** A social identity that has not yet been bound to a CPF. */
export interface PendingIdentity {
  kind: "pending";
  provider: ProviderKey;
  /** The provider's `sub`. Internal only (CLAUDE.md §5). */
  subject: string;
  /** Prefill for the form — the stored name comes from the CPF registry. */
  firstName: string;
  lastName: string;
  /** Registry lookups already spent by this identity. */
  attempts: number;
}

/** Cookie options. `lax` is enough: the pending cookie is only read same-site. */
function pendingCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: MAX_AGE,
  };
}

/** Sign a pending identity (for setting the cookie on a NextResponse). */
export function createPendingToken(identity: Omit<PendingIdentity, "kind">): Promise<string> {
  return new SignJWT({ ...identity, kind: "pending" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(secret());
}

/** Cookie options exposed for route handlers building their own NextResponse. */
export { pendingCookieOptions };

/**
 * Read the pending identity from the request cookies, or null when there is
 * none, it expired, or it is not actually a pending token.
 */
export async function readPending(): Promise<PendingIdentity | null> {
  const store = await cookies();
  const token = store.get(PENDING_COOKIE)?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, secret());
    if (payload.kind !== "pending") return null;
    return payload as unknown as PendingIdentity;
  } catch {
    return null;
  }
}

/**
 * Re-issue the cookie with the attempt counter advanced.
 *
 * Called after every registry lookup, successful or not — a successful one ends
 * the flow anyway, and counting only failures would let an attacker alternate.
 */
export async function recordAttempt(identity: PendingIdentity): Promise<void> {
  const store = await cookies();
  const token = await createPendingToken({
    provider: identity.provider,
    subject: identity.subject,
    firstName: identity.firstName,
    lastName: identity.lastName,
    attempts: identity.attempts + 1,
  });
  store.set(PENDING_COOKIE, token, pendingCookieOptions());
}

/** Drop the pending cookie — on completion, or when the citizen gives up. */
export async function clearPending(): Promise<void> {
  const store = await cookies();
  store.delete(PENDING_COOKIE);
}
