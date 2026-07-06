ALTER TABLE "CameraConfig" ALTER COLUMN "previewRotation" SET DEFAULT 0;

UPDATE "CameraConfig"
SET "previewRotation" = 0
WHERE "previewRotation" = 90;
