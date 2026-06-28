-- CreateEnum
CREATE TYPE "AgentType" AS ENUM ('FEDERAL_DEPUTY', 'STATE_DEPUTY', 'COUNCILLOR', 'SENATOR', 'GOVERNOR', 'MAYOR', 'PRESIDENT');

-- CreateEnum
CREATE TYPE "VoteValue" AS ENUM ('YES', 'NO', 'ABSTENTION');

-- CreateEnum
CREATE TYPE "VoterType" AS ENUM ('USER', 'AGENT');

-- CreateEnum
CREATE TYPE "Scope" AS ENUM ('NATIONAL', 'STATE', 'MUNICIPAL');

-- CreateEnum
CREATE TYPE "AdminRole" AS ENUM ('SUPER_ADMIN', 'EDITOR', 'VIEWER');

-- CreateEnum
CREATE TYPE "EntityStatus" AS ENUM ('ACTIVE', 'BLOCKED');

-- CreateEnum
CREATE TYPE "ImportSource" AS ENUM ('MANUAL', 'CAMARA', 'SENADO');

-- CreateTable
CREATE TABLE "Party" (
    "id" TEXT NOT NULL,
    "kid" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "acronym" TEXT,
    "description" TEXT,
    "logoUrl" TEXT,
    "status" "EntityStatus" NOT NULL DEFAULT 'ACTIVE',
    "agentCount" INTEGER NOT NULL DEFAULT 0,
    "source" "ImportSource" NOT NULL DEFAULT 'MANUAL',
    "externalRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Party_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PublicAgent" (
    "id" TEXT NOT NULL,
    "kid" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "imageUrl" TEXT,
    "description" TEXT,
    "cpfEncrypted" TEXT,
    "cpfHash" TEXT,
    "cpfPrefix" TEXT,
    "type" "AgentType" NOT NULL,
    "state" TEXT,
    "municipality" TEXT,
    "status" "EntityStatus" NOT NULL DEFAULT 'ACTIVE',
    "partyId" TEXT,
    "source" "ImportSource" NOT NULL DEFAULT 'MANUAL',
    "externalRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PublicAgent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Theme" (
    "id" TEXT NOT NULL,
    "kid" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "summary" TEXT NOT NULL DEFAULT '',
    "scope" "Scope" NOT NULL DEFAULT 'NATIONAL',
    "state" TEXT,
    "municipality" TEXT,
    "status" "EntityStatus" NOT NULL DEFAULT 'ACTIVE',
    "dimensions" JSONB,
    "yesCount" INTEGER NOT NULL DEFAULT 0,
    "noCount" INTEGER NOT NULL DEFAULT 0,
    "absCount" INTEGER NOT NULL DEFAULT 0,
    "source" "ImportSource" NOT NULL DEFAULT 'MANUAL',
    "externalRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Theme_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Article" (
    "id" TEXT NOT NULL,
    "kid" TEXT NOT NULL,
    "title" TEXT,
    "originalUrl" TEXT NOT NULL,
    "downloadUrl" TEXT,
    "themeId" TEXT NOT NULL,
    "source" "ImportSource" NOT NULL DEFAULT 'MANUAL',
    "externalRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Article_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vote" (
    "id" TEXT NOT NULL,
    "value" "VoteValue" NOT NULL,
    "voterType" "VoterType" NOT NULL,
    "themeId" TEXT NOT NULL,
    "userId" TEXT,
    "cpfHash" TEXT,
    "agentId" TEXT,
    "source" "ImportSource" NOT NULL DEFAULT 'MANUAL',
    "externalRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Vote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "kid" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "cpfEncrypted" TEXT NOT NULL,
    "cpfHash" TEXT NOT NULL,
    "cpfPrefix" TEXT NOT NULL,
    "voteVersion" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Administrator" (
    "id" TEXT NOT NULL,
    "kid" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "mobile" TEXT,
    "passwordHash" TEXT NOT NULL,
    "role" "AdminRole" NOT NULL DEFAULT 'EDITOR',
    "imageUrl" TEXT,
    "status" "EntityStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Administrator_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportRun" (
    "id" TEXT NOT NULL,
    "source" "ImportSource" NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "itemsSeen" INTEGER NOT NULL DEFAULT 0,
    "itemsUpserted" INTEGER NOT NULL DEFAULT 0,
    "ok" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,

    CONSTRAINT "ImportRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Party_kid_key" ON "Party"("kid");

-- CreateIndex
CREATE INDEX "Party_status_idx" ON "Party"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Party_source_externalRef_key" ON "Party"("source", "externalRef");

-- CreateIndex
CREATE UNIQUE INDEX "PublicAgent_kid_key" ON "PublicAgent"("kid");

-- CreateIndex
CREATE UNIQUE INDEX "PublicAgent_cpfHash_key" ON "PublicAgent"("cpfHash");

-- CreateIndex
CREATE INDEX "PublicAgent_type_idx" ON "PublicAgent"("type");

-- CreateIndex
CREATE INDEX "PublicAgent_state_idx" ON "PublicAgent"("state");

-- CreateIndex
CREATE INDEX "PublicAgent_status_idx" ON "PublicAgent"("status");

-- CreateIndex
CREATE INDEX "PublicAgent_partyId_idx" ON "PublicAgent"("partyId");

-- CreateIndex
CREATE UNIQUE INDEX "PublicAgent_source_externalRef_key" ON "PublicAgent"("source", "externalRef");

-- CreateIndex
CREATE UNIQUE INDEX "Theme_kid_key" ON "Theme"("kid");

-- CreateIndex
CREATE INDEX "Theme_status_idx" ON "Theme"("status");

-- CreateIndex
CREATE INDEX "Theme_scope_idx" ON "Theme"("scope");

-- CreateIndex
CREATE UNIQUE INDEX "Theme_source_externalRef_key" ON "Theme"("source", "externalRef");

-- CreateIndex
CREATE UNIQUE INDEX "Article_kid_key" ON "Article"("kid");

-- CreateIndex
CREATE INDEX "Article_themeId_idx" ON "Article"("themeId");

-- CreateIndex
CREATE UNIQUE INDEX "Article_source_externalRef_key" ON "Article"("source", "externalRef");

-- CreateIndex
CREATE INDEX "Vote_themeId_idx" ON "Vote"("themeId");

-- CreateIndex
CREATE INDEX "Vote_userId_idx" ON "Vote"("userId");

-- CreateIndex
CREATE INDEX "Vote_agentId_idx" ON "Vote"("agentId");

-- CreateIndex
CREATE UNIQUE INDEX "Vote_cpfHash_themeId_key" ON "Vote"("cpfHash", "themeId");

-- CreateIndex
CREATE UNIQUE INDEX "Vote_agentId_themeId_key" ON "Vote"("agentId", "themeId");

-- CreateIndex
CREATE UNIQUE INDEX "Vote_source_externalRef_key" ON "Vote"("source", "externalRef");

-- CreateIndex
CREATE UNIQUE INDEX "User_kid_key" ON "User"("kid");

-- CreateIndex
CREATE UNIQUE INDEX "User_cpfHash_key" ON "User"("cpfHash");

-- CreateIndex
CREATE UNIQUE INDEX "Administrator_kid_key" ON "Administrator"("kid");

-- CreateIndex
CREATE UNIQUE INDEX "Administrator_email_key" ON "Administrator"("email");

-- CreateIndex
CREATE INDEX "Administrator_status_idx" ON "Administrator"("status");

-- CreateIndex
CREATE INDEX "ImportRun_source_idx" ON "ImportRun"("source");

-- AddForeignKey
ALTER TABLE "PublicAgent" ADD CONSTRAINT "PublicAgent_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "Party"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Article" ADD CONSTRAINT "Article_themeId_fkey" FOREIGN KEY ("themeId") REFERENCES "Theme"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vote" ADD CONSTRAINT "Vote_themeId_fkey" FOREIGN KEY ("themeId") REFERENCES "Theme"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vote" ADD CONSTRAINT "Vote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vote" ADD CONSTRAINT "Vote_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "PublicAgent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
