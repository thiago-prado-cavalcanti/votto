/**
 * Centralized, validated access to environment variables.
 * Optional integrations (Redis, Anthropic, the social providers and the CPF
 * registry) degrade gracefully when unset.
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
 * Social identity providers. `mock` uses the built-in dev IdP at `/dev-idp`;
 * `real` performs an OIDC authorization-code + PKCE flow against each provider.
 */
type SocialMode = "mock" | "real";

/**
 * Registry backing CPF validation.
 *
 * `serpro` is the official Receita Federal channel (contract + e-CNPJ);
 * `infosimples` automates the same public portal per request, cheaper and with
 * no contract, but with no availability guarantee; `mock` accepts any
 * well-formed CPF and is development-only.
 */
type CpfValidationProvider = "mock" | "serpro" | "infosimples";

/**
 * Google Analytics 4 measurement id. The value is interpolated into an inline
 * `<script>` on the public site, so anything that isn't a well-formed id is
 * discarded (treated as "analytics disabled") rather than trusted.
 */
const GA_MEASUREMENT_ID = /^G-[A-Z0-9]{4,24}$/i;

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
  /**
   * Social login (Apple, Google, Meta) — the citizen's entry point now that
   * gov.br is out of reach (it is granted only to public institutions on
   * `.gov.br` domains). A social provider proves control of an account, never a
   * Brazilian identity, so it is always followed by the CPF step; see
   * `src/lib/auth/social/providers.ts`.
   */
  social: {
    /**
     * `mock` is refused in production, whatever the variable says.
     *
     * The default is `mock` so a fresh checkout runs with no credentials — and
     * that default is exactly the trap: a `.env.production` that simply forgets
     * the variable would serve `/dev-idp`, where anyone mints a citizen from a
     * form. That is the hole the gov.br flow was deleted for, and a comment
     * saying "remember to set this" is not a control. So the mode is derived,
     * not read: production is always `real`, and a misconfigured deploy fails
     * closed (no provider configured = no login) instead of failing open.
     */
    mode: (process.env.NODE_ENV === "production"
      ? "real"
      : (process.env.SOCIAL_MODE ?? "mock")) as SocialMode,
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    },
    /**
     * Apple authenticates the client with a short-lived ES256 JWT derived from
     * a P8 key rather than a static secret, so it needs four values instead of
     * two. `clientId` is the **Services ID**, not the App ID.
     */
    apple: {
      clientId: process.env.APPLE_CLIENT_ID ?? "",
      teamId: process.env.APPLE_TEAM_ID ?? "",
      keyId: process.env.APPLE_KEY_ID ?? "",
      /** Contents of the .p8 file. `\n` escapes are accepted so it fits one line. */
      privateKey: (process.env.APPLE_PRIVATE_KEY ?? "").replace(/\\n/g, "\n"),
    },
    facebook: {
      clientId: process.env.FACEBOOK_CLIENT_ID ?? "",
      clientSecret: process.env.FACEBOOK_CLIENT_SECRET ?? "",
    },
  },
  appUrl: process.env.APP_URL ?? "http://localhost:3100",
  /** GA4 measurement id (`G-…`). Empty = no analytics script on the site. */
  gaMeasurementId: GA_MEASUREMENT_ID.test(process.env.GA_MEASUREMENT_ID ?? "")
    ? (process.env.GA_MEASUREMENT_ID as string)
    : "",
} as const;

export const isAiEnabled = () => env.anthropicApiKey.length > 0;
export const isRedisEnabled = () => env.redisUrl.length > 0;
