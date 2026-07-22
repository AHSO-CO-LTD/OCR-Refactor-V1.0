CREATE TYPE "PlcProtocol" AS ENUM ('modbus_tcp', 'slmp');
CREATE TYPE "PlcKeyOperation" AS ENUM ('watch_boolean', 'write_boolean', 'pulse');

CREATE TABLE "PlcConfig" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "ipAddress" TEXT NOT NULL,
    "detectedProtocol" "PlcProtocol",
    "captureTriggerAddress" INTEGER NOT NULL,
    "stopTriggerAddress" INTEGER NOT NULL,
    "startTriggerAddress" INTEGER NOT NULL,
    "cameraPowerAddress" INTEGER NOT NULL,
    "cameraLightAddress" INTEGER NOT NULL,
    "errorPulseAddress" INTEGER NOT NULL,
    "errorPulseDurationMs" INTEGER NOT NULL DEFAULT 500,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PlcConfig_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PlcCustomKey" (
    "id" TEXT NOT NULL,
    "configId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" INTEGER NOT NULL,
    "operation" "PlcKeyOperation" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PlcCustomKey_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PlcCustomKey_configId_name_key" ON "PlcCustomKey"("configId", "name");
CREATE INDEX "PlcCustomKey_configId_address_idx" ON "PlcCustomKey"("configId", "address");

ALTER TABLE "PlcCustomKey"
ADD CONSTRAINT "PlcCustomKey_configId_fkey"
FOREIGN KEY ("configId") REFERENCES "PlcConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;
