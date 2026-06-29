-- AlterTable: long-form description + right/center/left viewpoints on Theme.
ALTER TABLE "Theme"
  ADD COLUMN "description" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "viewpoints" JSONB;
