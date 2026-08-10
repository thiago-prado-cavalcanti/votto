-- Authorship on themes + the AI plain-language layer.
--
-- Adds:
--   * who proposed each bill and who is reporting on it, linked to PublicAgent
--     when the author is a parliamentarian and kept as a plain name otherwise
--     (committees, the Executive, the other house);
--   * an AI-generated plain-language title and summary, stored ALONGSIDE the
--     official name/summary rather than replacing them, with the model and
--     timestamp that produced them;
--   * `dimensionsSource`, so an editor's political tagging is never overwritten
--     by a later AI pass.
--
-- Every statement is idempotent (IF NOT EXISTS) so a re-run after an interrupted
-- migrate succeeds instead of failing with Prisma P3009.

-- AlterTable: authorship + AI layer on Theme.
ALTER TABLE "Theme"
  ADD COLUMN IF NOT EXISTS "proposerId" TEXT,
  ADD COLUMN IF NOT EXISTS "proposerName" TEXT,
  ADD COLUMN IF NOT EXISTS "rapporteurId" TEXT,
  ADD COLUMN IF NOT EXISTS "plainTitle" TEXT,
  ADD COLUMN IF NOT EXISTS "plainSummary" TEXT,
  ADD COLUMN IF NOT EXISTS "aiModel" TEXT,
  ADD COLUMN IF NOT EXISTS "aiUpdatedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "dimensionsSource" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Theme_proposerId_idx" ON "Theme"("proposerId");
CREATE INDEX IF NOT EXISTS "Theme_rapporteurId_idx" ON "Theme"("rapporteurId");

-- AddForeignKey: ON DELETE SET NULL — deleting an agent must never cascade into
-- deleting the bills they authored.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Theme_proposerId_fkey') THEN
    ALTER TABLE "Theme" ADD CONSTRAINT "Theme_proposerId_fkey"
      FOREIGN KEY ("proposerId") REFERENCES "PublicAgent"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Theme_rapporteurId_fkey') THEN
    ALTER TABLE "Theme" ADD CONSTRAINT "Theme_rapporteurId_fkey"
      FOREIGN KEY ("rapporteurId") REFERENCES "PublicAgent"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END
$$;
