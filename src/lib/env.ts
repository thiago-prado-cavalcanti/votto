/**
 * Centralized, validated access to environment variables.
 * Optional integrations (Redis, Anthropic, real gov.br) degrade gracefully when unset.
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value || value.length === 0) {
    // Surfaced at runtime where used; we avoid throwing at import time so that
    // `next build` (which doesn't touch the DB/secrets) keeps working.
    return "";
  }
  return value;
}

/**
 * Citizen identity providers. `mock` uses the built-in dev IdP at `/dev-idp`;
 * `real` performs a full OIDC authorization-code + PKCE flow against gov.br.
 */
type GovbrMode = "mock" | "real";

/** Default gov.br scopes. `govbr_confiabilidades` exposes the account's seals. */
const DEFAULT_GOVBR_SCOPES = "openid email profile govbr_confiabilidades";

/**
 * Registry backing CPF validation.
 *
 * `serpro` is the official Receita Federal channel (contract + e-CNPJ);
 * `infosimples` automates the same public portal per request, cheaper and with
 * no contract, but with no availability guarantee; `mock` accepts any
 * well-formed CPF and is development-only.
 */
type CpfValidationProvider = "mock" | "serpro" | "infosimples";

export const env = {
  databaseUrl: required("DATABASE_URL"),
  redisUrl: process.env.REDIS_URL ?? "",
  authSecret: required("AUTH_SECRET") || "dev-insecure-secret-change-me",
  cpfEncKey: required("CPF_ENC_KEY"),
  cpfHmacKey: required("CPF_HMAC_KEY"),
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? "",
  anthropicModel: process.env.ANTHROPIC_MODEL ?? "claude-opus-5",
  /**
   * Model used for the per-theme plain-language briefs. Deliberately a cheap
   * one: the task is reading comprehension over a short ementa, and there are
   * hundreds of bills per import.
   */
  anthropicSummaryModel: process.env.ANTHROPIC_SUMMARY_MODEL ?? "claude-haiku-4-5",
  /** Shared secret protecting POST /api/cron/{job}. Unset = endpoint disabled. */
  cronSecret: process.env.CRON_SECRET ?? "",
  govbr: {
    mode: (process.env.GOVBR_MODE ?? "mock") as GovbrMode,
    /** OIDC issuer. Staging: https://sso.staging.acesso.gov.br */
    issuer: (process.env.GOVBR_ISSUER ?? "https://sso.acesso.gov.br").replace(/\/+$/, ""),
    clientId: process.env.GOVBR_CLIENT_ID ?? "",
    clientSecret: process.env.GOVBR_CLIENT_SECRET ?? "",
    redirectUri:
      process.env.GOVBR_REDIRECT_URI ?? "http://localhost:3000/api/auth/govbr/callback",
    scopes: process.env.GOVBR_SCOPES ?? DEFAULT_GOVBR_SCOPES,
    /**
     * Send a PKCE challenge (S256). On by default: gov.br's own integration
     * guide documents PKCE, and an authorization server that ignores the
     * parameter is unaffected. It is a toggle rather than a constant because
     * gov.br's discovery document does NOT advertise
     * `code_challenge_methods_supported`, so if a given client registration
     * rejects the challenge, set `GOVBR_PKCE=false` to fall back to a plain
     * authorization-code flow (still protected by `state` + `nonce`).
     */
    pkce: (process.env.GOVBR_PKCE ?? "true").toLowerCase() !== "false",
    /**
     * Minimum account reliability ("selo") required to vote — `bronze`, `prata`
     * or `ouro`. Empty means any gov.br account with a verified CPF is accepted.
     * Silver and gold are the seals granted through a bank or biometric
     * validation, so this is also the knob that enforces bank-grade identity.
     */
    minTrust: (process.env.GOVBR_MIN_TRUST ?? "").toLowerCase(),
  },
  /**
   * Official CPF registry used to validate a citizen's CPF + birth date.
   * `mock` keeps local development and `next build` free of credentials.
   */
  cpfValidation: {
    provider: (process.env.CPF_VALIDATION_PROVIDER ?? "mock") as CpfValidationProvider,
    serpro: {
      consumerKey: process.env.SERPRO_CPF_CONSUMER_KEY ?? "",
      consumerSecret: process.env.SERPRO_CPF_CONSUMER_SECRET ?? "",
      /**
       * The trial dataset answers only for fictitious CPFs, so it is the right
       * target until the Loja Serpro contract (which requires an e-CNPJ) exists.
       */
      useTrial: (process.env.SERPRO_CPF_TRIAL ?? "true").toLowerCase() !== "false",
    },
    infosimples: {
      token: process.env.INFOSIMPLES_TOKEN ?? "",
    },
  },
  appUrl: process.env.APP_URL ?? "http://localhost:3000",
} as const;

export const isAiEnabled = () => env.anthropicApiKey.length > 0;
export const isRedisEnabled = () => env.redisUrl.length > 0;

/** Whether the real gov.br OIDC flow is fully configured. */
export const isGovbrConfigured = () =>
  env.govbr.mode === "real" &&
  env.govbr.issuer.length > 0 &&
  env.govbr.clientId.length > 0 &&
  env.govbr.clientSecret.length > 0;
