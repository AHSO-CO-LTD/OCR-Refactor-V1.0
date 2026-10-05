CREATE TYPE "DongilDeliveryDisposition" AS ENUM ('ACCEPTED', 'REPLAYED');

CREATE TYPE "DongilHistorySyncRunState" AS ENUM (
  'PREPARING',
  'RUNNING',
  'PAUSED',
  'BLOCKED',
  'COMPLETED'
);

CREATE TYPE "DongilHistorySyncItemStatus" AS ENUM (
  'PENDING',
  'SENDING',
  'CONFIRMED',
  'FAILED'
);

ALTER TABLE "DongilSyncOutbox"
  ADD COLUMN "deliveryDisposition" "DongilDeliveryDisposition";

CREATE TABLE "DongilHistorySyncRun" (
  "id" TEXT NOT NULL,
  "state" "DongilHistorySyncRunState" NOT NULL DEFAULT 'RUNNING',
  "snapshotTotal" INTEGER NOT NULL,
  "snapshotConfirmed" INTEGER NOT NULL DEFAULT 0,
  "acceptedCount" INTEGER NOT NULL DEFAULT 0,
  "replayedCount" INTEGER NOT NULL DEFAULT 0,
  "failedCount" INTEGER NOT NULL DEFAULT 0,
  "currentBatch" INTEGER NOT NULL DEFAULT 0,
  "totalBatches" INTEGER NOT NULL,
  "lastBatchId" TEXT,
  "lastRetryAt" TIMESTAMP(3),
  "checkpointedAt" TIMESTAMP(3),
  "startedById" TEXT,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "pausedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "lastErrorCode" TEXT,
  "lastErrorMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DongilHistorySyncRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DongilHistorySyncItem" (
  "id" TEXT NOT NULL,
  "runId" TEXT NOT NULL,
  "outboxId" TEXT NOT NULL,
  "localResultId" TEXT NOT NULL,
  "inspectedAt" TIMESTAMP(3) NOT NULL,
  "localSessionId" TEXT,
  "productCode" TEXT NOT NULL,
  "result" "InspectionResult" NOT NULL,
  "okCount" INTEGER NOT NULL,
  "ngCount" INTEGER NOT NULL,
  "sequence" INTEGER NOT NULL,
  "status" "DongilHistorySyncItemStatus" NOT NULL DEFAULT 'PENDING',
  "localBatchId" TEXT,
  "deliveryDisposition" "DongilDeliveryDisposition",
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastErrorCode" TEXT,
  "lastErrorMessage" TEXT,
  "confirmedAt" TIMESTAMP(3),
  "verifiedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DongilHistorySyncItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DongilHistorySyncScope" (
  "id" TEXT NOT NULL,
  "runId" TEXT NOT NULL,
  "scope" TEXT NOT NULL,
  "scopeKey" TEXT NOT NULL,
  "total" INTEGER NOT NULL,
  "ok" INTEGER NOT NULL,
  "ng" INTEGER NOT NULL,
  "counterMatched" BOOLEAN,
  "counterReconciledAt" TIMESTAMP(3),
  "idsVerifiedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "lastErrorCode" TEXT,
  "lastErrorMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DongilHistorySyncScope_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DongilHistorySyncInvalidItem" (
  "id" TEXT NOT NULL,
  "sourceLogId" TEXT NOT NULL,
  "plcCaptureId" TEXT,
  "reason" TEXT NOT NULL,
  "capturedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DongilHistorySyncInvalidItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DongilSyncWorkerLease" (
  "id" TEXT NOT NULL DEFAULT 'default',
  "ownerId" TEXT,
  "expiresAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DongilSyncWorkerLease_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DongilHistorySyncItem_runId_outboxId_key"
  ON "DongilHistorySyncItem"("runId", "outboxId");
CREATE UNIQUE INDEX "DongilHistorySyncItem_runId_sequence_key"
  ON "DongilHistorySyncItem"("runId", "sequence");
CREATE INDEX "DongilHistorySyncItem_runId_status_sequence_idx"
  ON "DongilHistorySyncItem"("runId", "status", "sequence");
CREATE INDEX "DongilHistorySyncItem_runId_localSessionId_inspectedAt_idx"
  ON "DongilHistorySyncItem"("runId", "localSessionId", "inspectedAt");
CREATE INDEX "DongilHistorySyncRun_state_startedAt_idx"
  ON "DongilHistorySyncRun"("state", "startedAt");
CREATE UNIQUE INDEX "DongilHistorySyncRun_one_active_key"
  ON "DongilHistorySyncRun" ((1))
  WHERE "state" IN ('PREPARING', 'RUNNING', 'PAUSED', 'BLOCKED');
CREATE UNIQUE INDEX "DongilHistorySyncScope_runId_scope_scopeKey_key"
  ON "DongilHistorySyncScope"("runId", "scope", "scopeKey");
CREATE INDEX "DongilHistorySyncScope_runId_completedAt_idx"
  ON "DongilHistorySyncScope"("runId", "completedAt");
CREATE UNIQUE INDEX "DongilHistorySyncInvalidItem_sourceLogId_key"
  ON "DongilHistorySyncInvalidItem"("sourceLogId");

ALTER TABLE "DongilHistorySyncItem"
  ADD CONSTRAINT "DongilHistorySyncItem_runId_fkey"
  FOREIGN KEY ("runId") REFERENCES "DongilHistorySyncRun"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DongilHistorySyncScope"
  ADD CONSTRAINT "DongilHistorySyncScope_runId_fkey"
  FOREIGN KEY ("runId") REFERENCES "DongilHistorySyncRun"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "Permission" ("key", "name", "group", "devOnly", "createdAt")
VALUES
  ('dongil.history-sync.view', 'View Dongil history synchronization', 'dongil', false, CURRENT_TIMESTAMP),
  ('dongil.history-sync.manage', 'Manage Dongil history synchronization', 'dongil', false, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO UPDATE SET
  "name" = EXCLUDED."name",
  "group" = EXCLUDED."group",
  "devOnly" = EXCLUDED."devOnly";

INSERT INTO "RolePermission" ("roleCode", "permissionKey")
SELECT role."code", mapping."permissionKey"
FROM (
  VALUES
    ('admin', 'dongil.history-sync.view'),
    ('admin', 'dongil.history-sync.manage'),
    ('engineer', 'dongil.history-sync.view'),
    ('operator', 'dongil.history-sync.view')
) AS mapping("roleCode", "permissionKey")
INNER JOIN "Role" AS role ON role."code"::text = mapping."roleCode"
ON CONFLICT DO NOTHING;
