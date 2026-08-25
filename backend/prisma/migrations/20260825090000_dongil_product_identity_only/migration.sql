ALTER TABLE "DongilSyncOutbox" ADD COLUMN "productName" TEXT;

UPDATE "DongilSyncOutbox"
SET
    "status" = 'PENDING',
    "nextAttemptAt" = CURRENT_TIMESTAMP,
    "lastErrorCode" = NULL,
    "lastErrorMessage" = NULL
WHERE "status" = 'BLOCKED_CONFIG';
