/**
 * One OIDC authorization-code + PKCE client, driven by the provider registry.
 *
 * Google, Apple and Facebook differ in credentials and response mode, not in
 * protocol, so they share this module and diverge only where
 * `ProviderConfig` says they do.
 *
 * What the flow guarantees, and what it does not:
 *   * `state` binds the callback to the browser that started it (CSRF), and
 *     carries the provider key so a callback cannot be replayed onto a
 *     different provider's route.
 *   * `nonce` is bound into the id_token, so a token minted for another session
 *     cannot be replayed into this one.
 *   * PKCE makes a stolen authorization code useless without this browser.
 *   * The identity is read from the **signature-verified** id_token — never from
 *     the query string, and never from `/userinfo` alone.
 *
 * It does **not** establish that the person is a given Brazilian citizen. That
 * is the CPF step's job, and nothing here should be read as standing in for it.
 */
import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import { redirectUri, type ProviderConfig } from "@/lib/auth/social/providers";

// ─── Transient flow cookies ──────────────────────────────────────────────────

/** CSRF `state`, stored as `provider:token` so the callback can check both. */
export const SOCIAL_STATE_COOKIE = "votto_social_state";
/** Replay-protection `nonce`, bound into the id_token. */
export const SOCIAL_NONCE_COOKIE = "votto_social_nonce";
/** PKCE verifier — never leaves this browser. */
export const SOCIAL_VERIFIER_COOKIE = "votto_social_verifier";

/** Every cookie the authorization flow leaves behind. */
export const SOCIAL_FLOW_COOKIES = [
  SOCIAL_STATE_COOKIE,
  SOCIAL_NONCE_COOKIE,
  SOCIAL_VERIFIER_COOKIE,
] as const;

/**
 * Options for the short-lived flow cookies.
 *
 * `sameSite` follows the provider's response mode, and getting this wrong is a
 * silent, total failure: `lax` is right for a redirect back as a top-level GET,
 * but Apple answers with a cross-site top-level **POST**, and `lax` withholds
 * cookies from exactly that — every Apple login would fail the `state` check.
 * `none` requires `secure`, hence HTTPS for the Apple callback.
 */
export function flowCookieOptions(provider: ProviderConfig) {
  const crossSitePost = provider.responseMode === "form_post";
  return {
    httpOnly: true,
    secure: crossSitePost || process.env.NODE_ENV === "production",
    sameSite: crossSitePost ? ("none" as const) : ("lax" as const),
    path: "/",
    maxAge: 600, // 10 min — the user has that long to finish at the provider.
  };
}

// ─── Authorization request ───────────────────────────────────────────────────

/** One-time values that must survive the redirect, stored in httpOnly cookies. */
export interface AuthorizationRequest {
  url: string;
  /** Already prefixed with the provider key: `google:AbC…`. */
  state: string;
  nonce: string;
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
 * Build the provider's authorization URL plus the one-time values the callback
 * must check. The caller persists `state`, `nonce` and `codeVerifier` in
 * httpOnly cookies before redirecting.
 */
export function buildAuthorizationUrl(provider: ProviderConfig): AuthorizationRequest {
  const state = `${provider.key}:${randomToken()}`;
  const nonce = randomToken();
  const codeVerifier = randomToken(48);

  const url = new URL(provider.authorizationEndpoint);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", provider.clientId);
  url.searchParams.set("scope", provider.scopes);
  url.searchParams.set("redirect_uri", redirectUri(provider));
  url.searchParams.set("state", state);
  url.searchParams.set("nonce", nonce);
  url.searchParams.set(
    "code_challenge",
    base64url(createHash("sha256").update(codeVerifier).digest()),
  );
  url.searchParams.set("code_challenge_method", "S256");
  if (provider.responseMode === "form_post") {
    url.searchParams.set("response_mode", "form_post");
  }

  return { url: url.toString(), state, nonce, codeVerifier };
}

// ─── Token exchange ──────────────────────────────────────────────────────────

/** Token endpoint response (only the fields we use). */
interface TokenResponse {
  access_token?: string;
  id_token: string;
}

/**
 * Exchange an authorization code for tokens.
 *
 * All three providers authenticate the client in the request body rather than
 * with HTTP Basic; Apple's `client_secret` is a JWT minted for this one call.
 */
export async function exchangeCode(
  provider: ProviderConfig,
  code: string,
  codeVerifier: string,
): Promise<TokenResponse> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri(provider),
    client_id: provider.clientId,
    client_secret: await provider.clientSecret(),
    code_verifier: codeVerifier,
  });

  const res = await fetch(provider.tokenEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body,
    cache: "no-store",
  });

  if (!res.ok) {
    // The body carries the OAuth error code; keep it out of user-facing output.
    const detail = await res.text().catch(() => "");
    throw new Error(
      `${provider.label}: token endpoint respondeu HTTP ${res.status}: ${detail.slice(0, 200)}`,
    );
  }

  const tokens = (await res.json()) as TokenResponse;
  if (!tokens.id_token) {
    // Almost always a missing `openid` scope on the app registration.
    throw new Error(`${provider.label} não retornou id_token.`);
  }
  return tokens;
}

// ─── Token verification ──────────────────────────────────────────────────────

/** JWKS resolvers, keyed by URI so `jose` can cache and rotate keys itself. */
const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function jwks(uri: string) {
  let set = jwksCache.get(uri);
  if (!set) {
    set = createRemoteJWKSet(new URL(uri));
    jwksCache.set(uri, set);
  }
  return set;
}

/**
 * Verify an id_token against the provider's JWKS, issuer and audience, and check
 * the `nonce` matches the one this browser started the flow with.
 */
export async function verifyIdToken(
  provider: ProviderConfig,
  idToken: string,
  nonce: string,
): Promise<JWTPayload> {
  const { payload } = await jwtVerify(idToken, jwks(provider.jwksUri), {
    issuer: provider.issuer,
    audience: provider.clientId,
    clockTolerance: 60,
  });

  if (payload.nonce !== nonce) {
    throw new Error(`${provider.label}: nonce do id_token não confere.`);
  }
  return payload;
}

// ─── Identity ────────────────────────────────────────────────────────────────

/** What a social provider can actually tell us. Note the absence of a CPF. */
export interface SocialIdentity {
  /** The provider's `sub` claim. Internal dedup key only (CLAUDE.md §5). */
  subject: string;
  /** Best-effort display name — a prefill, replaced by the registry's name. */
  firstName: string;
  lastName: string;
}

/** Split a full name into first + remaining, mirroring the importer's rule. */
function splitFullName(full: string): { firstName: string; lastName: string } {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: "", lastName: "" };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

/**
 * Read the identity out of a verified id_token.
 *
 * `appleUser` is the JSON blob Apple posts alongside the code — and only on the
 * **first** authorization ever granted by that Apple ID. On every later login it
 * is absent and the id_token carries no name at all, which is fine: the name
 * Votto stores comes from the CPF registry, and this is only a form prefill.
 *
 * No e-mail is read from any provider. Keeping one would put a second
 * identifier beyond the name into a leak (CLAUDE.md §5).
 */
export function readIdentity(payload: JWTPayload, appleUser?: string | null): SocialIdentity {
  const subject = String(payload.sub ?? "");
  if (!subject) {
    throw new Error("id_token sem claim `sub` — provedor não identificou a conta.");
  }

  let firstName = typeof payload.given_name === "string" ? payload.given_name : "";
  let lastName = typeof payload.family_name === "string" ? payload.family_name : "";

  if (!firstName && typeof payload.name === "string") {
    ({ firstName, lastName } = splitFullName(payload.name));
  }

  if (!firstName && appleUser) {
    try {
      const parsed = JSON.parse(appleUser) as { name?: { firstName?: string; lastName?: string } };
      firstName = parsed.name?.firstName?.trim() ?? "";
      lastName = parsed.name?.lastName?.trim() ?? "";
    } catch {
      // A malformed blob costs us a prefill, nothing more.
    }
  }

  return { subject, firstName, lastName };
}
