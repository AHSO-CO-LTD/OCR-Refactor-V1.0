ALTER TABLE "PlcConfig"
ADD COLUMN "stopDelaySeconds" INTEGER NOT NULL DEFAULT 5;

ALTER TABLE "PlcConfig"
ADD CONSTRAINT "PlcConfig_stop_delay_seconds_check"
CHECK ("stopDelaySeconds" BETWEEN 0 AND 300);
