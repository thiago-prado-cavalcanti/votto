-- Presiding officer on a roll call.
--
-- Both houses bar whoever is in the chair from voting in an open ballot, and
-- both mark them with a code of their own: Câmara "Artigo 17" (RICD art. 17),
-- Senado "Presidente (art. 51 RISF)". `mapVote` already dropped those, correctly
-- — they are not a position. But the quality index then read the absence of a
-- vote as an absence from the sitting, which is the opposite of what happened:
-- the person was in the room, running it.
--
-- Measured on the live data before this column existed: over one year the Senado
-- code appeared exactly once per sitting, 39 of 46 of them the Senate
-- President's, and the index consequently placed him in the 1st percentile of
-- attendance and 8th out of 100 overall — the worst senator in Brazil, for
-- having presided. The Câmara is the same shape (17 occurrences over 20
-- sittings, 16 of them the Speaker's).
--
-- Recording who presided lets the recompute take that sitting out of that
-- agent's denominator, exactly as a day of official leave is taken out.
--
-- Idempotent: re-running is a no-op.

ALTER TABLE "RollCall" ADD COLUMN IF NOT EXISTS "presidingAgentId" TEXT;

CREATE INDEX IF NOT EXISTS "RollCall_presidingAgentId_idx" ON "RollCall"("presidingAgentId");

DO $$ BEGIN
  ALTER TABLE "RollCall" ADD CONSTRAINT "RollCall_presidingAgentId_fkey"
    FOREIGN KEY ("presidingAgentId") REFERENCES "PublicAgent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
