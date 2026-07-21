CREATE TYPE "LineResultSavePolicy" AS ENUM ('all', 'ok', 'ng', 'none');

CREATE TYPE "LineSessionEndReason" AS ENUM ('line_stop', 'product_change');

ALTER TABLE "InspectionJob"
ADD COLUMN "endReason" "LineSessionEndReason",
ADD COLUMN "resultSaveFolderPath" TEXT,
ADD COLUMN "resultSavePolicy" "LineResultSavePolicy",
ADD COLUMN "resultSessionFolderName" TEXT,
ADD COLUMN "resultSavedAt" TIMESTAMP(3),
ADD COLUMN "resultSaveError" TEXT;

CREATE TABLE "LineResultSettings" (
  "id" TEXT NOT NULL DEFAULT 'default',
  "saveFolderPath" TEXT,
  "savePolicy" "LineResultSavePolicy" NOT NULL DEFAULT 'all',
  "saveBySession" BOOLEAN NOT NULL DEFAULT true,
  "newSessionOnLineStop" BOOLEAN NOT NULL DEFAULT true,
  "newSessionOnProductChange" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "LineResultSettings_pkey" PRIMARY KEY ("id")
);

INSERT INTO "LineResultSettings" (
  "id",
  "savePolicy",
  "saveBySession",
  "newSessionOnLineStop",
  "newSessionOnProductChange",
  "updatedAt"
)
VALUES ('default', 'all', true, true, true, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
