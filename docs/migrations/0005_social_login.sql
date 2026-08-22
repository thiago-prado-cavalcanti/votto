-- Social login (Apple, Google, Meta) + registry-verified CPF.
--
-- Citizens no longer arrive with a provider-verified CPF (gov.br is restricted
-- to public institutions on .gov.br domains). They authenticate with a social
-- provider and then confirm CPF + birth date against the official registry.
--
-- Idempotent: every statement guards on existence, so a re-run is a no-op.

-- ─── Provider enum ───────────────────────────────────────────────────────────
-- No INSTAGRAM member: the Instagram button runs the Facebook Login flow (see
-- prisma/schema.prisma), so both buttons resolve to one account per citizen.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SocialProvider') THEN
    CREATE TYPE "SocialProvider" AS ENUM ('GOOGLE', 'APPLE', 'FACEBOOK');
  END IF;
END $$;

-- ─── User: registry verification trail ───────────────────────────────────────
-- Birth YEAR only. The registry answers with the full date; the year is all the
-- platform needs (age gate, anonymized demographics) and storing less is the
-- rule (CLAUDE.md §5).
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "birthYear" INTEGER;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "cpfVerifiedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "cpfVerificationSource" TEXT;

-- Proof that the citizen consented to having their votes processed. A vote on
-- a political theme is an "opinião política" — sensitive data under LGPD
-- art. 5º, II — and art. 8º, §2 puts the burden of proving consent on the
-- controller, so the consent has to leave a record.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "politicalConsentAt" TIMESTAMP(3);

-- ─── SocialAccount ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "SocialAccount" (
  "id"          TEXT NOT NULL,
  "provider"    "SocialProvider" NOT NULL,
  "subject"     TEXT NOT NULL,
  "userId"      TEXT NOT NULL,
  "lastLoginAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SocialAccount_pkey" PRIMARY KEY ("id")
);

-- One row per (provider, sub): this is what recognizes a returning citizen.
CREATE UNIQUE INDEX IF NOT EXISTS "SocialAccount_provider_subject_key"
  ON "SocialAccount" ("provider", "subject");
CREATE INDEX IF NOT EXISTS "SocialAccount_userId_idx"
  ON "SocialAccount" ("userId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'SocialAccount_userId_fkey'
  ) THEN
    ALTER TABLE "SocialAccount"
      ADD CONSTRAINT "SocialAccount_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
