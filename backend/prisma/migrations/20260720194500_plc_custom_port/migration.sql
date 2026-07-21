ALTER TABLE "PlcConfig"
ADD COLUMN "port" INTEGER NOT NULL DEFAULT 502;

UPDATE "PlcConfig"
SET "port" = 5000
WHERE "protocol" = 'slmp';

ALTER TABLE "PlcConfig"
ADD CONSTRAINT "PlcConfig_port_check"
CHECK ("port" BETWEEN 1 AND 65535);
