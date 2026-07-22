ALTER TYPE "LineSessionEndReason" ADD VALUE IF NOT EXISTS 'plc_stop';
ALTER TYPE "LineSessionEndReason" ADD VALUE IF NOT EXISTS 'app_shutdown';

ALTER TABLE "PlcConfig"
  ALTER COLUMN "captureTriggerAddress" DROP NOT NULL,
  ALTER COLUMN "stopTriggerAddress" DROP NOT NULL,
  ALTER COLUMN "startTriggerAddress" DROP NOT NULL,
  ALTER COLUMN "cameraPowerAddress" DROP NOT NULL,
  ALTER COLUMN "cameraLightAddress" DROP NOT NULL,
  ALTER COLUMN "errorPulseAddress" DROP NOT NULL,
  ADD COLUMN "okResultAddress" INTEGER,
  ADD COLUMN "waitingCheckingAddress" INTEGER;

ALTER TABLE "InspectionLog" ADD COLUMN "plcCaptureId" TEXT;
CREATE INDEX "InspectionLog_plcCaptureId_idx" ON "InspectionLog"("plcCaptureId");
