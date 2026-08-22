-- Acompanhar ("follow"): a citizen declares which public agent represents them.
--
-- The ballot is secret, so the platform can never ask who somebody voted for.
-- Following is the honest analogue: instead of asserting a past vote, the
-- citizen declares — in the present, and revocably — who represents them. The
-- set of followers is that agent's "base", and the base is what the alignment
-- index measures the agent against, replacing the old proxy (the agent against
-- the aggregate of every citizen, which corresponds to no electorate at all).
--
-- ONE FOLLOW PER OFFICE, because that is how the ballot works: a citizen elects
-- one federal deputy, one senator, one governor. That is what "type" is doing
-- here — it is copied from the agent so the rule can live in a UNIQUE index
-- rather than in an application check that two concurrent tabs would slip past.
--
-- No "kid" column: like "Vote", a follow is never addressed from outside the
-- system — it is reached through the session plus the agent's kid (CLAUDE.md
-- §5). And no personal data lands here beyond the foreign key: the row is the
-- same class of sensitive data as a vote, which the schema already stores this
-- way because the index cannot be computed otherwise.
--
-- Idempotent: re-running is a no-op.

CREATE TABLE IF NOT EXISTS "AgentFollow" (
    "id"        TEXT NOT NULL,
    "userId"    TEXT NOT NULL,
    "agentId"   TEXT NOT NULL,
    "type"      "AgentType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentFollow_pkey" PRIMARY KEY ("id")
);

-- The rule itself. Everything else is a lookup index.
CREATE UNIQUE INDEX IF NOT EXISTS "AgentFollow_userId_type_key" ON "AgentFollow"("userId", "type");
CREATE INDEX IF NOT EXISTS "AgentFollow_agentId_idx" ON "AgentFollow"("agentId");
CREATE INDEX IF NOT EXISTS "AgentFollow_userId_idx" ON "AgentFollow"("userId");

-- Cascades both ways: a deleted citizen leaves no declaration behind (LGPD
-- erasure), and a deleted agent leaves no dangling base.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AgentFollow_userId_fkey') THEN
        ALTER TABLE "AgentFollow"
            ADD CONSTRAINT "AgentFollow_userId_fkey"
            FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AgentFollow_agentId_fkey') THEN
        ALTER TABLE "AgentFollow"
            ADD CONSTRAINT "AgentFollow_agentId_fkey"
            FOREIGN KEY ("agentId") REFERENCES "PublicAgent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END
$$;
