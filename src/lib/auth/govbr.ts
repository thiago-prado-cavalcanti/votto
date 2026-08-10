/**
 * gov.br OIDC client (Login Único).
 *
 * Implements the authorization-code flow with PKCE against the gov.br SSO, which
 * is the only way a citizen can authenticate on Votto: the provider has already
 * verified the CPF, so we never collect or validate documents ourselves
 * (CLAUDE.md §5).
 *
 * Flow, and why each piece is here:
 *   1. `buildAuthorizationUrl` — redirects to gov.br carrying `state` (CSRF),
 *      `nonce` (replay protection, bound into the id_token) and a PKCE
 *      `code_challenge`. The verifier stays in an httpOnly cookie, so a stolen
 *      authorization code is useless without this browser.
 *   2. `exchangeCode` — swaps the code for tokens over HTTP Basic auth, as the
 *      gov.br token endpoint requires.
 *   3. `verifyIdToken` — validates the id_token's signature against the issuer's
 *      published JWKS, plus issuer/audience/expiry/nonce. Identity is taken from
 *      the verified token, never from the unverified query string.
 *   4. `fetchUserInfo` — gov.br answers `/userinfo` with a *signed JWT*
 *      (`application/jwt`), not plain JSON, so the response is verified the same
 *      way before being read.
 *
 * The CPF arrives as the `sub` claim, in plain digits.
 *
 * Endpoints are read from the issuer's discovery document rather than hardcoded,
 * so staging and production differ only by `GOVBR_ISSUER`.
 */
import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { createRemoteJWKSet, decodeJwt, jwtVerify, type JWTPayload } from "jose";
import { env } from "@/lib/env";
import { isValidCpf, normalizeCpf } from "@/lib/crypto/cpf";

// ─── Transient flow cookies ──────────────────────────────────────────────────

/** CSRF `state`, echoed back by the provider. Also used by the mock IdP. */
export const GOVBR_STATE_COOKIE = "votto_govbr_state";
/** Replay-protection `nonce`, bound into the id_token. */
export const GOVBR_NONCE_COOKIE = "votto_govbr_nonce";
/** PKCE verifier — never leaves this browser. */
export const GOVBR_VERIFIER_COOKIE = "votto_govbr_verifier";

/** Every cookie the authorization flow leaves behind. */
export const GOVBR_FLOW_COOKIES = [
  GOVBR_STATE_COOKIE,
  GOVBR_NONCE_COOKIE,
  GOVBR_VERIFIER_COOKIE,
] as const;

/**
 * Options for the short-lived flow cookies. `sameSite: lax` is required — the
 * callback arrives as a top-level GET redirect from gov.br, and `strict` would
 * withhold the cookies exactly then.
 */
export function flowCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: 600, // 10 min — the user has that long to finish at gov.br.
  };
}

// ─── Discovery ───────────────────────────────────────────────────────────────

/** The subset of the OIDC discovery document we rely on. */
interface Discovery {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  userinfo_endpoint?: string;
  jwks_uri: string;
}

/**
 * Discovery is cached process-wide: it changes at most on a provider upgrade,
 * and refetching it on every login would add a round trip to the critical path.
 */
let discoveryCache: { issuer: string; value: Promise<Discovery> } | null = null;

/** Fetch (and memoize) the issuer's OIDC discovery document. */
export function discover(): Promise<Discovery> {
  const issuer = env.govbr.issuer;
  if (discoveryCache?.issuer === issuer) return discoveryCache.value;

  const value = (async () => {
    const res = await fetch(`${issuer}/.well-known/openid-configuration`, {
      headers: { Accept: "application/json" },
      // The document is stable; let the platform cache it for an hour.
      next: { revalidate: 3600 },
    });
    if (!res.ok) {
      throw new Error(`gov.br discovery falhou: HTTP ${res.status}`);
    }
    return (await res.json()) as Discovery;
  })();

  discoveryCache = { issuer, value };
  return value;
}

/** JWKS resolvers, keyed by URI so `jose` can cache and rotate keys itself. */
const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

/** Remote key set for the issuer, reused across requests. */
function jwks(uri: string) {
  let set = jwksCache.get(uri);
  if (!set) {
    set = createRemoteJWKSet(new URL(uri));
    jwksCache.set(uri, set);
  }
  return set;
}

// ─── Authorization request ───────────────────────────────────────────────────

/** One-time values that must survive the redirect, stored in httpOnly cookies. */
export interface AuthorizationRequest {
  url: string;
  state: string;
  nonce: string;
  /** Empty when PKCE is disabled (see `env.govbr.pkce`). */
  codeVerifier: string;
}

/** URL-safe base64 (no padding), as required for PKCE. */
function base64url(buffer: Buffer): string {
  return buffer.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Random URL-safe token used for `state`, `nonce` and the PKCE verifier. */
function randomToken(bytes = 32): string {
  return base64url(randomBytes(bytes));
}

/**
 * Build the gov.br authorization URL together with the one-time values the
 * callback must check. The caller is responsible for persisting `state`, `nonce`
 * and `codeVerifier` in httpOnly cookies before redirecting.
 */
export async function buildAuthorizationUrl(): Promise<AuthorizationRequest> {
  const { authorization_endpoint } = await discover();

  const state = randomToken();
  const nonce = randomToken();
  const codeVerifier = env.govbr.pkce ? randomToken(48) : "";

  const url = new URL(authorization_endpoint);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", env.govbr.clientId);
  url.searchParams.set("scope", env.govbr.scopes);
  url.searchParams.set("redirect_uri", env.govbr.redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("nonce", nonce);

  if (codeVerifier) {
    url.searchParams.set(
      "code_challenge",
      base64url(createHash("sha256").update(codeVerifier).digest()),
    );
    url.searchParams.set("code_challenge_method", "S256");
  }

  return { url: url.toString(), state, nonce, codeVerifier };
}

// ─── Token exchange ──────────────────────────────────────────────────────────

/** Token endpoint response (only the fields we use). */
interface TokenResponse {
  access_token: string;
  id_token: string;
  token_type?: string;
  expires_in?: number;
}

/**
 * Exchange an authorization code for tokens. gov.br authenticates the client
 * with HTTP Basic (`client_id:client_secret`), so the secret never appears in
 * the request body.
 */
export async function exchangeCode(
  code: string,
  codeVerifier: string,
): Promise<TokenResponse> {
  const { token_endpoint } = await discover();

  const basic = Buffer.from(`${env.govbr.clientId}:${env.govbr.clientSecret}`).toString("base64");
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: env.govbr.redirectUri,
  });
  // Only sent when the authorization request carried a challenge.
  if (codeVerifier) body.set("code_verifier", codeVerifier);

  const res = await fetch(token_endpoint, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body,
    cache: "no-store",
  });

  if (!res.ok) {
    // The body carries the OAuth error code; keep it out of user-facing output.
    const detail = await res.text().catch(() => "");
    throw new Error(`gov.br token endpoint respondeu HTTP ${res.status}: ${detail.slice(0, 200)}`);
  }

  const tokens = (await res.json()) as TokenResponse;
  if (!tokens.id_token || !tokens.access_token) {
    throw new Error("gov.br não retornou id_token/access_token.");
  }
  return tokens;
}

// ─── Token verification ──────────────────────────────────────────────────────

/**
 * Verify an id_token against the issuer's JWKS and the expected audience, and
 * check the `nonce` matches the one this browser started the flow with.
 */
export async function verifyIdToken(idToken: string, nonce: string): Promise<JWTPayload> {
  const { jwks_uri, issuer } = await discover();

  const { payload } = await jwtVerify(idToken, jwks(jwks_uri), {
    issuer,
    audience: env.govbr.clientId,
    clockTolerance: 60,
  });

  if (payload.nonce !== nonce) {
    throw new Error("nonce do id_token não confere.");
  }
  return payload;
}

/**
 * Fetch the userinfo document. gov.br returns it as a signed JWT, so the
 * response is verified before use; a plain-JSON response (other deployments, or
 * a future change) is accepted too.
 */
async function fetchUserInfo(accessToken: string): Promise<JWTPayload | null> {
  const { userinfo_endpoint, jwks_uri, issuer } = await discover();
  if (!userinfo_endpoint) return null;

  try {
    const res = await fetch(userinfo_endpoint, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });
    if (!res.ok) return null;

    const contentType = res.headers.get("content-type") ?? "";
    if (contentType.includes("application/jwt")) {
      const token = (await res.text()).trim();
      const { payload } = await jwtVerify(token, jwks(jwks_uri), { issuer, clockTolerance: 60 });
      return payload;
    }
    return (await res.json()) as JWTPayload;
  } catch {
    // Userinfo only enriches the name; the id_token already carries identity.
    return null;
  }
}

// ─── Identity ────────────────────────────────────────────────────────────────

/** The verified citizen identity gov.br hands us. */
export interface GovbrIdentity {
  cpf: string;
  firstName: string;
  lastName: string;
  /** Reliability seals on the account, lowercased (e.g. `["prata"]`). */
  trustLevels: string[];
}

/** Reliability seals, weakest first — used to enforce `GOVBR_MIN_TRUST`. */
const TRUST_ORDER = ["bronze", "prata", "ouro"] as const;

/**
 * Read the account's reliability seals. gov.br surfaces them in the `amr`
 * claim (authentication methods reference), where entries look like
 * `gov-br-selo-prata` or plain `prata`. Unknown shapes yield an empty list,
 * which only matters when a minimum is configured.
 */
function readTrustLevels(payload: JWTPayload): string[] {
  const raw = payload.amr;
  const entries = Array.isArray(raw) ? raw : typeof raw === "string" ? [raw] : [];
  const found = new Set<string>();

  for (const entry of entries) {
    const value = String(entry).toLowerCase();
    for (const level of TRUST_ORDER) {
      if (value.includes(level)) found.add(level);
    }
  }
  return [...found];
}

/**
 * Whether the account satisfies the configured minimum reliability. With no
 * minimum configured every gov.br account passes — the CPF is already verified
 * by the provider, which is what the one-vote-per-citizen rule depends on.
 */
export function meetsTrustRequirement(trustLevels: string[]): boolean {
  const required = env.govbr.minTrust;
  if (!required) return true;

  const requiredIndex = TRUST_ORDER.indexOf(required as (typeof TRUST_ORDER)[number]);
  if (requiredIndex < 0) return true; // Misconfigured value must not lock everyone out.

  return trustLevels.some((level) => TRUST_ORDER.indexOf(level as (typeof TRUST_ORDER)[number]) >= requiredIndex);
}

/** Split a full name into first + remaining, mirroring the importer's rule. */
function splitFullName(full: string): { firstName: string; lastName: string } {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: "Cidadão", lastName: "" };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

/**
 * Turn a verified id_token (plus, when available, userinfo) into the minimal
 * identity Votto stores: first name, last name and CPF. Nothing else from the
 * provider is persisted — a leak must expose nothing beyond the name
 * (CLAUDE.md §5).
 *
 * Throws when the CPF is missing or fails its check digits, which would mean the
 * provider returned something we cannot trust as an identity.
 */
export async function resolveIdentity(
  idTokenPayload: JWTPayload,
  accessToken: string,
): Promise<GovbrIdentity> {
  const cpf = normalizeCpf(String(idTokenPayload.sub ?? ""));
  if (!isValidCpf(cpf)) {
    throw new Error("gov.br não retornou um CPF válido no claim `sub`.");
  }

  let fullName = typeof idTokenPayload.name === "string" ? idTokenPayload.name : "";
  let trustLevels = readTrustLevels(idTokenPayload);

  if (!fullName || trustLevels.length === 0) {
    const info = await fetchUserInfo(accessToken);
    if (info) {
      if (!fullName && typeof info.name === "string") fullName = info.name;
      if (trustLevels.length === 0) trustLevels = readTrustLevels(info);
    }
  }

  const { firstName, lastName } = splitFullName(fullName);
  return { cpf, firstName, lastName, trustLevels };
}

/**
 * Best-effort decode of an id_token without verification — for logging a failed
 * flow only. Never use this to establish identity.
 */
export function peekIdToken(idToken: string): JWTPayload | null {
  try {
    return decodeJwt(idToken);
  } catch {
    return null;
  }
}
