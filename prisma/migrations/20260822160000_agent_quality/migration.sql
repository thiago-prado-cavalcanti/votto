-- Quality index for public agents (CLAUDE.md §3.3).
--
-- A second reading of a parliamentarian, orthogonal to the alignment index:
-- alignment asks whether they agree with you, quality asks whether they are
-- doing the job. Four weighted pillars — attendance, bills authored, bills
-- rapporteured, and the running cost of the mandate — each ranked against the
-- agent's peers rather than against an absolute scale.
--
-- Four things this migration creates, and why each exists:
--
-- 1. `RollCall` / `RollCallVote` — the attendance ledger. `Vote` cannot serve
--    as one: it is unique on (agentId, themeId) and is rewritten when a later
--    roll call touches the same bill, because it holds the agent's STANDING
--    POSITION, which is what the alignment index consumes. Two roll calls on
--    one bill collapse into a single row there. Relaxing that unique key would
--    break alignment in order to fix attendance; a ledger of its own breaks
--    nothing, and the vote jobs fill it from responses they already download.
--
-- 2. `AgentService` — the stretches of a mandate, EXERCISE and LEAVE, as the
--    houses publish them. The attendance denominator subtracts official leave:
--    a deputy licensed to serve as a state secretary is not absent from votes
--    held while they were legitimately away.
--
-- 3. `AgentMetrics` — raw per-year counts, not scores. Every input the index
--    needs becomes a column, so re-tuning weights is a recompute with no
--    network (`npm run requality`) — the same property that makes
--    `scripts/reprioritize.ts` possible for `Theme.priority`. It is also what
--    lets any published figure be defended document by document.
--
-- 4. `PublicAgent.qualityScore` / `qualityPillars` — the denormalized result,
--    indexed so lists order in SQL. `qualityScore` is NULLABLE ON PURPOSE and
--    has no default: the score is published, so an agent we cannot measure must
--    show no reading at all. A zero would read as an accusation rather than as
--    missing data.
--
-- Idempotent: re-running is a no-op.

-- ── Enums ────────────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE "ServiceKind" AS ENUM ('EXERCISE', 'LEAVE');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── PublicAgent: the denormalized index ──────────────────────────────────────

ALTER TABLE "PublicAgent" ADD COLUMN IF NOT EXISTS "qualityScore" INTEGER;
ALTER TABLE "PublicAgent" ADD COLUMN IF NOT EXISTS "qualityPillars" JSONB;
ALTER TABLE "PublicAgent" ADD COLUMN IF NOT EXISTS "qualityComputedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "PublicAgent_qualityScore_idx" ON "PublicAgent"("qualityScore");

-- ── Attendance ledger ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "RollCall" (
    "id" TEXT NOT NULL,
    "house" "House" NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "themeId" TEXT,
    "source" "ImportSource" NOT NULL,
    "externalRef" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RollCall_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "RollCall_house_occurredAt_idx" ON "RollCall"("house", "occurredAt");
CREATE INDEX IF NOT EXISTS "RollCall_themeId_idx" ON "RollCall"("themeId");
CREATE UNIQUE INDEX IF NOT EXISTS "RollCall_source_externalRef_key" ON "RollCall"("source", "externalRef");

CREATE TABLE IF NOT EXISTS "RollCallVote" (
    "id" TEXT NOT NULL,
    "rollCallId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "value" "VoteValue" NOT NULL,

    CONSTRAINT "RollCallVote_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "RollCallVote_agentId_idx" ON "RollCallVote"("agentId");
CREATE UNIQUE INDEX IF NOT EXISTS "RollCallVote_rollCallId_agentId_key" ON "RollCallVote"("rollCallId", "agentId");

-- ── Mandate stretches ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "AgentService" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3),
    "kind" "ServiceKind" NOT NULL,
    "reason" TEXT,
    "source" "ImportSource" NOT NULL,
    "externalRef" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentService_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AgentService_agentId_startsAt_idx" ON "AgentService"("agentId", "startsAt");
CREATE UNIQUE INDEX IF NOT EXISTS "AgentService_source_externalRef_key" ON "AgentService"("source", "externalRef");

-- ── Raw measurements ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "AgentMetrics" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "rollCallsEligible" INTEGER NOT NULL DEFAULT 0,
    "rollCallsAttended" INTEGER NOT NULL DEFAULT 0,
    "daysInExercise" INTEGER NOT NULL DEFAULT 0,
    "daysOnLeave" INTEGER NOT NULL DEFAULT 0,
    "billsAuthored" INTEGER NOT NULL DEFAULT 0,
    "billsAdvanced" INTEGER NOT NULL DEFAULT 0,
    "billsRapporteured" INTEGER NOT NULL DEFAULT 0,
    "quotaSpent" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "quotaDocuments" INTEGER NOT NULL DEFAULT 0,
    "quotaByCategory" JSONB,
    "legislatures" INTEGER[],
    "source" "ImportSource" NOT NULL DEFAULT 'MANUAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentMetrics_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AgentMetrics_year_idx" ON "AgentMetrics"("year");
CREATE UNIQUE INDEX IF NOT EXISTS "AgentMetrics_agentId_year_key" ON "AgentMetrics"("agentId", "year");

-- ── Foreign keys ─────────────────────────────────────────────────────────────
-- Postgres has no ADD CONSTRAINT IF NOT EXISTS, so each is guarded by name.

DO $$ BEGIN
  ALTER TABLE "RollCall" ADD CONSTRAINT "RollCall_themeId_fkey"
    FOREIGN KEY ("themeId") REFERENCES "Theme"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "RollCallVote" ADD CONSTRAINT "RollCallVote_rollCallId_fkey"
    FOREIGN KEY ("rollCallId") REFERENCES "RollCall"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "RollCallVote" ADD CONSTRAINT "RollCallVote_agentId_fkey"
    FOREIGN KEY ("agentId") REFERENCES "PublicAgent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "AgentService" ADD CONSTRAINT "AgentService_agentId_fkey"
    FOREIGN KEY ("agentId") REFERENCES "PublicAgent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "AgentMetrics" ADD CONSTRAINT "AgentMetrics_agentId_fkey"
    FOREIGN KEY ("agentId") REFERENCES "PublicAgent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
