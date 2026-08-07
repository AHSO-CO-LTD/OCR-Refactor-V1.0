CREATE TYPE "TrainingImageSavePolicy" AS ENUM ('all', 'ok', 'ng');

ALTER TABLE "LineResultSettings"
  ADD COLUMN "trainingImageEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "trainingImageSaveFolderPath" TEXT,
  ADD COLUMN "trainingImageSavePolicy" "TrainingImageSavePolicy" NOT NULL DEFAULT 'all';
