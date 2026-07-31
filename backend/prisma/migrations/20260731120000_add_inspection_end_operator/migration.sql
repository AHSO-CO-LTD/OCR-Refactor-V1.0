-- Preserve all existing inspection jobs and infer the ending operator for
-- historical sessions from the operator who originally started the session.
ALTER TABLE "InspectionJob"
ADD COLUMN "endedById" TEXT,
ADD COLUMN "endedByInferred" BOOLEAN NOT NULL DEFAULT false;

UPDATE "InspectionJob"
SET
  "endedById" = "operatorId",
  "endedByInferred" = true
WHERE "stoppedAt" IS NOT NULL;

ALTER TABLE "InspectionJob"
ADD CONSTRAINT "InspectionJob_endedById_fkey"
FOREIGN KEY ("endedById") REFERENCES "User"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;
