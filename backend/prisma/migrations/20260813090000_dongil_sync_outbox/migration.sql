CREATE TYPE "DongilSyncOutboxStatus" AS ENUM (
  'PENDING',
  'SENDING',
  'SENT',
  'BLOCKED_CONFIG',
  'FAILED'
);

CREATE TABLE "DongilSyncConfiguration" (
  "id" TEXT NOT NULL DEFAULT 'default',
  "serverUrl" TEXT NOT NULL,
  "machineId" TEXT NOT NULL,
  "machineTypeCode" TEXT NOT NULL DEFAULT 'WASHING_MACHINE',
  "licenseStatus" TEXT NOT NULL,
  "assignedMachineTypeCode" TEXT,
  "lastRegisteredAt" TIMESTAMP(3),
  "lastConfigSyncAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "DongilSyncConfiguration_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DongilProductAssignment" (
  "productCode" TEXT NOT NULL,
  "profileVersion" INTEGER NOT NULL,
  "modelVersion" TEXT NOT NULL,
  "assignedAt" TIMESTAMP(3) NOT NULL,
  "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "DongilProductAssignment_pkey" PRIMARY KEY ("productCode")
);

CREATE TABLE "DongilSyncOutbox" (
  "id" TEXT NOT NULL,
  "localResultId" TEXT NOT NULL,
  "productCode" TEXT NOT NULL,
  "profileVersion" INTEGER,
  "modelVersion" TEXT,
  "result" "InspectionResult" NOT NULL,
  "localSessionId" TEXT,
  "inspectedAt" TIMESTAMP(3) NOT NULL,
  "status" "DongilSyncOutboxStatus" NOT NULL DEFAULT 'PENDING',
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastErrorCode" TEXT,
  "lastErrorMessage" TEXT,
  "sentAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "DongilSyncOutbox_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DongilSyncOutbox_localResultId_key"
  ON "DongilSyncOutbox"("localResultId");

CREATE INDEX "DongilSyncOutbox_status_nextAttemptAt_createdAt_idx"
  ON "DongilSyncOutbox"("status", "nextAttemptAt", "createdAt");

CREATE INDEX "DongilSyncOutbox_inspectedAt_idx"
  ON "DongilSyncOutbox"("inspectedAt");
