ALTER TABLE "PlcConfig"
ADD COLUMN "sleepTimeSeconds" INTEGER NOT NULL DEFAULT 300;

ALTER TABLE "PlcConfig"
ADD CONSTRAINT "PlcConfig_sleep_time_seconds_check"
CHECK ("sleepTimeSeconds" BETWEEN 1 AND 86400);

-- Older Modbus TCP configuration stored native coil addresses. The application
-- now stores logical Mitsubishi M addresses and applies the 8192 coil offset
-- only when calling the Device Tool.
UPDATE "PlcConfig"
SET
  "captureTriggerAddress" = CASE WHEN "captureTriggerAddress" >= 8192 THEN "captureTriggerAddress" - 8192 ELSE "captureTriggerAddress" END,
  "stopTriggerAddress" = CASE WHEN "stopTriggerAddress" >= 8192 THEN "stopTriggerAddress" - 8192 ELSE "stopTriggerAddress" END,
  "startTriggerAddress" = CASE WHEN "startTriggerAddress" >= 8192 THEN "startTriggerAddress" - 8192 ELSE "startTriggerAddress" END,
  "cameraPowerAddress" = CASE WHEN "cameraPowerAddress" >= 8192 THEN "cameraPowerAddress" - 8192 ELSE "cameraPowerAddress" END,
  "cameraLightAddress" = CASE WHEN "cameraLightAddress" >= 8192 THEN "cameraLightAddress" - 8192 ELSE "cameraLightAddress" END,
  "errorPulseAddress" = CASE WHEN "errorPulseAddress" >= 8192 THEN "errorPulseAddress" - 8192 ELSE "errorPulseAddress" END
WHERE "protocol" = 'modbus_tcp';

UPDATE "PlcCustomKey" AS custom_key
SET "address" = custom_key."address" - 8192
FROM "PlcConfig" AS config
WHERE custom_key."configId" = config."id"
  AND config."protocol" = 'modbus_tcp'
  AND custom_key."address" >= 8192;
