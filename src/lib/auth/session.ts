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
}

type SessionPayload = AdminSession | CitizenSession;

async function sign(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(secret());
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

async function readSession<T extends SessionPayload>(cookieName: string): Promise<T | null> {
  const store = await cookies();
  const token = store.get(cookieName)?.value;
  if (!token) return null;
  return verify<T>(token);
}

async function clearSession(cookieName: string): Promise<void> {
  const store = await cookies();
  store.delete(cookieName);
}

// ─── Admin ───────────────────────────────────────────────────────────────────

export const setAdminSession = (s: AdminSession) => setSession(ADMIN_COOKIE, s);
export const getAdminSession = () => readSession<AdminSession>(ADMIN_COOKIE);
export const clearAdminSession = () => clearSession(ADMIN_COOKIE);

// ─── Citizen ─────────────────────────────────────────────────────────────────

export const setCitizenSession = (s: CitizenSession) => setSession(CITIZEN_COOKIE, s);
export const getCitizenSession = () => readSession<CitizenSession>(CITIZEN_COOKIE);
export const clearCitizenSession = () => clearSession(CITIZEN_COOKIE);
