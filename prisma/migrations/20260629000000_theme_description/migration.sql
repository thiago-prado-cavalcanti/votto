-- AlterTable: long-form description + right/center/left viewpoints on Theme.
-- Idempotent (IF NOT EXISTS) so a re-run after an interrupted/failed migrate
-- succeeds whether or not the columns were already added (avoids Prisma P3009).
ALTER TABLE "Theme"
  ADD COLUMN IF NOT EXISTS "description" TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "viewpoints" JSONB;
