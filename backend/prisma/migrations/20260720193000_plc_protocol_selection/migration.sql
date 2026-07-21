ALTER TABLE "PlcConfig"
RENAME COLUMN "detectedProtocol" TO "protocol";

UPDATE "PlcConfig"
SET "protocol" = 'modbus_tcp'
WHERE "protocol" IS NULL;

ALTER TABLE "PlcConfig"
ALTER COLUMN "protocol" SET DEFAULT 'modbus_tcp',
ALTER COLUMN "protocol" SET NOT NULL;
