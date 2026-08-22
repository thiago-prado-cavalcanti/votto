/**
 * Session core: signed, httpOnly JWT cookies (via `jose`). Two independent
 * sessions exist — administrators and citizens — so the two surfaces never share
 * credentials. Keep this module free of DB/UI concerns.
 */
import "server-only";
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { env } from "@/lib/env";

const secret = () => new TextEncoder().encode(env.authSecret);

export const ADMIN_COOKIE = "votto_admin";
export const CITIZEN_COOKIE = "votto_citizen";
const MAX_AGE = 60 * 60 * 8; // 8h

export interface AdminSession {
  kind: "admin";
  adminKid: string;
  role: string;
  name: string;
}

export interface CitizenSession {
  kind: "citizen";
  userKid: string;
  cpfHash: string;
  name: string;
  /**
   * Set once the citizen has answered the vote challenge
   * (`@/lib/auth/vote-challenge`). It lives on the session rather than in a
   * cookie of its own so that "once per session" is true by construction:
   * it cannot outlive the session, and a fresh login always asks again.
   */
  voteConfirmed?: true;
}

type SessionPayload = AdminSession | CitizenSession;

async function sign(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(secret());
}

/** Cookie options shared by both sessions. Exposed for route handlers that must
 *  set the cookie on their own NextResponse (cookies() isn't merged there). */
export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: MAX_AGE,
  };
}

/** Sign a citizen session token (for setting the cookie on a NextResponse). */
export function createCitizenSessionToken(s: CitizenSession): Promise<string> {
  return sign(s);
}

/**
 * Re-issue the current citizen session with the vote challenge marked as
 * answered.
 *
 * The original expiry is carried over rather than refreshed: confirming a vote
 * should not silently extend how long the session lives.
 */
export async function markVoteConfirmed(session: CitizenSession): Promise<void> {
  const store = await cookies();
  const current = store.get(CITIZEN_COOKIE)?.value;

  // Seconds left on the session, floored at a minute so a token about to expire
  // still produces a usable cookie instead of an already-dead one.
  let remaining = MAX_AGE;
  if (current) {
    try {
      const { payload } = await jwtVerify(current, secret());
      if (typeof payload.exp === "number") {
        remaining = Math.max(60, payload.exp - Math.floor(Date.now() / 1000));
      }
    } catch {
      // Unreadable: fall back to a full window rather than logging the citizen out.
    }
  }

  const token = await new SignJWT({ ...session, voteConfirmed: true })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${remaining}s`)
    .sign(secret());

  store.set(CITIZEN_COOKIE, token, { ...sessionCookieOptions(), maxAge: remaining });
}

async function verify<T extends SessionPayload>(token: string): Promise<T | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    return payload as unknown as T;
  } catch {
    return null;
  }
}

async function setSession(cookieName: string, payload: SessionPayload): Promise<void> {
  const token = await sign(payload);
  const store = await cookies();
  store.set(cookieName, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
  });
}

/**
 * Read a session cookie, rejecting anything that is not the expected kind.
 *
 * The check is not decoration. Every token the app signs — admin session,
 * citizen session, pending sign-up (`./pending.ts`) — uses the same secret, so
 * without it a valid token of one kind dropped into another's cookie would
 * verify and be cast to the wrong shape: a pending token in the citizen cookie
 * would read as a citizen with an undefined `userKid`.
 */
async function readSession<T extends SessionPayload>(
  cookieName: string,
  kind: T["kind"],
): Promise<T | null> {
  const store = await cookies();
  const token = store.get(cookieName)?.value;
  if (!token) return null;

  const payload = await verify<T>(token);
  return payload?.kind === kind ? payload : null;
}

async function clearSession(cookieName: string): Promise<void> {
  const store = await cookies();
  store.delete(cookieName);
}

// ─── Admin ───────────────────────────────────────────────────────────────────

export const setAdminSession = (s: AdminSession) => setSession(ADMIN_COOKIE, s);
export const getAdminSession = () => readSession<AdminSession>(ADMIN_COOKIE, "admin");
export const clearAdminSession = () => clearSession(ADMIN_COOKIE);

// ─── Citizen ─────────────────────────────────────────────────────────────────

export const setCitizenSession = (s: CitizenSession) => setSession(CITIZEN_COOKIE, s);
export const getCitizenSession = () => readSession<CitizenSession>(CITIZEN_COOKIE, "citizen");
export const clearCitizenSession = () => clearSession(CITIZEN_COOKIE);
