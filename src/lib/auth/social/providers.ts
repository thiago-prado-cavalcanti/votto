/**
 * The social identity providers a citizen may sign in with, and what each one
 * needs that the others don't.
 *
 * **Why social login at all.** gov.br handed us a provider-verified CPF, which
 * is exactly what "one vote per citizen" rests on — but it is granted only to
 * public institutions on `.gov.br` domains, so Votto cannot have it. What
 * replaces it is two steps that are weaker apart and workable together: a
 * social provider proves the person controls an account, and the official CPF
 * registry then confirms the CPF they type is real and belongs to someone born
 * on the date they claim (`src/lib/identity/validation.ts`).
 *
 * Read that honestly: **a social provider proves nothing about a Brazilian
 * identity.** No provider here returns a CPF, and none ever will. Everything in
 * this module is the first half of a flow that is meaningless without the
 * second — see `src/lib/auth/pending.ts`.
 *
 * Endpoints are hardcoded rather than discovered. Discovery costs a round trip
 * on the critical path to fetch three URLs that change on a provider rewrite,
 * and Facebook's own document omits `token_endpoint` anyway, so it could not be
 * the single mechanism regardless. Signing keys still rotate freely: `jose`
 * fetches those from `jwksUri` on demand.
 */
import "server-only";
import { SignJWT, importPKCS8 } from "jose";
import { env } from "@/lib/env";
import type { SocialProvider } from "@/generated/prisma";

/** Providers that exist as accounts. `instagram` is a button, not a provider. */
export type ProviderKey = "google" | "apple" | "facebook";

/** What the login screen offers. See `resolveProvider` for why these differ. */
export type ButtonKey = ProviderKey | "instagram";

/**
 * How the provider delivers the authorization response.
 *
 * `form_post` matters far beyond parsing: it arrives as a **cross-site top-level
 * POST**, and a `SameSite=Lax` cookie is withheld from exactly that. A provider
 * using it needs `SameSite=None; Secure` on the flow cookies, which in turn
 * needs HTTPS. Apple is the only one here that does.
 */
export type ResponseMode = "query" | "form_post";

export interface ProviderConfig {
  key: ProviderKey;
  /** Value stored on `SocialAccount.provider`. */
  stored: SocialProvider;
  /** Name shown to the citizen. */
  label: string;
  /** Expected `iss` claim of the id_token. */
  issuer: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  jwksUri: string;
  scopes: string;
  responseMode: ResponseMode;
  clientId: string;
  /**
   * Client secret for the token request. Async because Apple derives a fresh
   * signed JWT per exchange rather than holding a static string.
   */
  clientSecret(): Promise<string>;
  /** Whether this provider's credentials are complete enough to attempt a flow. */
  configured(): boolean;
}

/**
 * Facebook endpoints are deliberately unversioned. Meta expires each Graph API
 * version after roughly two years, so a pinned `v21.0` here is a login outage
 * with a fuse on it; unversioned URLs follow the app's configured default
 * version instead. Meta's own discovery document points at the unversioned
 * dialog too.
 */
const FACEBOOK = {
  issuer: "https://www.facebook.com",
  authorizationEndpoint: "https://www.facebook.com/dialog/oauth",
  tokenEndpoint: "https://graph.facebook.com/oauth/access_token",
  jwksUri: "https://www.facebook.com/.well-known/oauth/openid/jwks/",
};

/**
 * Apple's client secret: an ES256 JWT signed with the P8 key, not a shared
 * string. Apple refuses one that expires more than six months out; ten minutes
 * is used here because it is minted per exchange, which also means the key
 * never has to be rotated on a calendar.
 */
async function appleClientSecret(): Promise<string> {
  const { clientId, teamId, keyId, privateKey } = env.social.apple;
  if (!privateKey) {
    throw new Error("APPLE_PRIVATE_KEY ausente — não é possível assinar o client_secret.");
  }

  const key = await importPKCS8(privateKey, "ES256");
  return new SignJWT({})
    .setProtectedHeader({ alg: "ES256", kid: keyId })
    .setIssuer(teamId)
    .setIssuedAt()
    .setExpirationTime("10m")
    .setAudience("https://appleid.apple.com")
    .setSubject(clientId)
    .sign(key);
}

/** Static registry, built from the environment on each read. */
function registry(): Record<ProviderKey, ProviderConfig> {
  const { google, apple, facebook } = env.social;

  return {
    google: {
      key: "google",
      stored: "GOOGLE",
      label: "Google",
      issuer: "https://accounts.google.com",
      authorizationEndpoint: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenEndpoint: "https://oauth2.googleapis.com/token",
      jwksUri: "https://www.googleapis.com/oauth2/v3/certs",
      // No `email`: Votto never stores one, and asking for what you discard
      // is both a worse consent screen and a contradiction of CLAUDE.md §5.
      scopes: "openid profile",
      responseMode: "query",
      clientId: google.clientId,
      clientSecret: async () => google.clientSecret,
      configured: () => google.clientId.length > 0 && google.clientSecret.length > 0,
    },

    apple: {
      key: "apple",
      stored: "APPLE",
      label: "Apple",
      issuer: "https://appleid.apple.com",
      authorizationEndpoint: "https://appleid.apple.com/auth/authorize",
      tokenEndpoint: "https://appleid.apple.com/auth/token",
      jwksUri: "https://appleid.apple.com/auth/keys",
      // `name` (without `email`) is still what forces form_post — see responseMode.
      scopes: "openid name",
      // Apple *requires* form_post whenever `name` or `email` is requested.
      responseMode: "form_post",
      clientId: apple.clientId,
      clientSecret: appleClientSecret,
      configured: () =>
        apple.clientId.length > 0 &&
        apple.teamId.length > 0 &&
        apple.keyId.length > 0 &&
        apple.privateKey.length > 0,
    },

    facebook: {
      key: "facebook",
      stored: "FACEBOOK",
      label: "Facebook",
      ...FACEBOOK,
      scopes: "openid public_profile",
      responseMode: "query",
      clientId: facebook.clientId,
      clientSecret: async () => facebook.clientSecret,
      configured: () => facebook.clientId.length > 0 && facebook.clientSecret.length > 0,
    },
  };
}

/**
 * Resolve a route slug to a provider.
 *
 * `instagram` resolves to Facebook, and that is a considered answer rather than
 * a shortcut. Meta shut off the Instagram Basic Display API on 2024-12-04, and
 * its replacement ("Instagram API with Instagram Login") serves only
 * Business/Creator accounts and returns a username — no name, no e-mail, no
 * person. Meta's only consumer identity provider is Facebook Login, which
 * already resolves an Instagram account through the Accounts Center. Storing
 * the result as FACEBOOK is what stops a citizen who taps both buttons from
 * ending up with two accounts under one CPF.
 *
 * Returns null for an unknown slug, so a route can 404 rather than guess.
 */
export function resolveProvider(slug: string): ProviderConfig | null {
  const key = slug === "instagram" ? "facebook" : slug;
  const found = registry()[key as ProviderKey];
  return found ?? null;
}

/** Whether a slug names something the login screen can offer. */
export function isButtonKey(slug: string): slug is ButtonKey {
  return slug === "instagram" || slug in registry();
}

/**
 * Which buttons to render. In `mock` mode every button is offered (the dev IdP
 * needs no credentials); in `real` mode only providers whose credentials are
 * complete, so a visitor is never sent to a provider that will bounce them.
 *
 * Instagram rides on Facebook's credentials, since it *is* the Facebook flow.
 */
export function availableButtons(): ButtonKey[] {
  if (env.social.mode === "mock") return ["google", "apple", "facebook", "instagram"];

  const all = registry();
  const buttons: ButtonKey[] = [];
  for (const key of ["google", "apple", "facebook"] as const) {
    if (all[key].configured()) buttons.push(key);
  }
  if (all.facebook.configured()) buttons.push("instagram");
  return buttons;
}

/** Callback URL for a provider. Must match the provider's registration exactly. */
export function redirectUri(provider: ProviderConfig): string {
  return new URL(`/api/auth/social/${provider.key}/callback`, env.appUrl).toString();
}
