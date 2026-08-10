-- Federal-scope integration with the Câmara dos Deputados and Senado Federal
-- open-data APIs (CLAUDE.md §8).
--
-- Adds:
--   * legislative metadata on Theme (identifier, house, situation, urgency,
--     priority rank, official subject classifications, keywords, dates);
--   * official party metadata (leader, website, house head count);
--   * agent mandate state (inOffice, legislature, official profile URL);
--   * roll-call provenance on Vote (occurredAt, sessionRef);
--   * the SyncJob table backing the weekly workers (state + single-flight lock).
--
-- Every statement is idempotent (IF NOT EXISTS / DO blocks) so a re-run after an
-- interrupted migrate succeeds instead of failing with Prisma P3009.

-- CreateEnum: legislative house of origin.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'House') THEN
    CREATE TYPE "House" AS ENUM ('CAMARA', 'SENADO', 'CONGRESSO');
  END IF;
END
$$;

-- AlterTable: official party metadata from the source APIs.
ALTER TABLE "Party"
  ADD COLUMN IF NOT EXISTS "leaderName" TEXT,
  ADD COLUMN IF NOT EXISTS "websiteUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "memberCount" INTEGER;

-- AlterTable: agent mandate state and official profile link.
ALTER TABLE "PublicAgent"
  ADD COLUMN IF NOT EXISTS "externalUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "inOffice" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "legislature" INTEGER;

-- AlterTable: legislative metadata on Theme.
ALTER TABLE "Theme"
  ADD COLUMN IF NOT EXISTS "identifier" TEXT,
  ADD COLUMN IF NOT EXISTS "house" "House",
  ADD COLUMN IF NOT EXISTS "externalUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "situation" TEXT,
  ADD COLUMN IF NOT EXISTS "urgency" TEXT,
  ADD COLUMN IF NOT EXISTS "priority" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "classifications" JSONB,
  ADD COLUMN IF NOT EXISTS "keywords" TEXT,
  ADD COLUMN IF NOT EXISTS "inProgress" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "presentedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "lastActionAt" TIMESTAMP(3);

-- AlterTable: roll-call provenance on agent votes.
ALTER TABLE "Vote"
  ADD COLUMN IF NOT EXISTS "occurredAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "sessionRef" TEXT;

-- AlterTable: link each import run to its registered job.
ALTER TABLE "ImportRun"
  ADD COLUMN IF NOT EXISTS "job" TEXT;

-- CreateTable: scheduled sync job state + single-flight lock.
CREATE TABLE IF NOT EXISTS "SyncJob" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "runningSince" TIMESTAMP(3),
    "lastStartedAt" TIMESTAMP(3),
    "lastFinishedAt" TIMESTAMP(3),
    "lastOk" BOOLEAN NOT NULL DEFAULT false,
    "lastNote" TEXT,
    "lastItemsSeen" INTEGER NOT NULL DEFAULT 0,
    "lastItemsUpserted" INTEGER NOT NULL DEFAULT 0,
    "watermark" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SyncJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "SyncJob_name_key" ON "SyncJob"("name");
CREATE INDEX IF NOT EXISTS "ImportRun_job_startedAt_idx" ON "ImportRun"("job", "startedAt");
CREATE INDEX IF NOT EXISTS "PublicAgent_inOffice_idx" ON "PublicAgent"("inOffice");
CREATE INDEX IF NOT EXISTS "Theme_priority_idx" ON "Theme"("priority");
CREATE INDEX IF NOT EXISTS "Theme_lastActionAt_idx" ON "Theme"("lastActionAt");
CREATE INDEX IF NOT EXISTS "Theme_inProgress_idx" ON "Theme"("inProgress");
