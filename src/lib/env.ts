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

export const env = {
  databaseUrl: required("DATABASE_URL"),
  redisUrl: process.env.REDIS_URL ?? "",
  authSecret: required("AUTH_SECRET") || "dev-insecure-secret-change-me",
  cpfEncKey: required("CPF_ENC_KEY"),
  cpfHmacKey: required("CPF_HMAC_KEY"),
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? "",
  anthropicModel: process.env.ANTHROPIC_MODEL ?? "claude-opus-4-8",
  govbr: {
    mode: (process.env.GOVBR_MODE ?? "mock") as "mock" | "real",
    issuer: process.env.GOVBR_ISSUER ?? "",
    clientId: process.env.GOVBR_CLIENT_ID ?? "",
    clientSecret: process.env.GOVBR_CLIENT_SECRET ?? "",
    redirectUri:
      process.env.GOVBR_REDIRECT_URI ?? "http://localhost:3000/api/auth/govbr/callback",
  },
  appUrl: process.env.APP_URL ?? "http://localhost:3000",
} as const;

export const isAiEnabled = () => env.anthropicApiKey.length > 0;
export const isRedisEnabled = () => env.redisUrl.length > 0;
