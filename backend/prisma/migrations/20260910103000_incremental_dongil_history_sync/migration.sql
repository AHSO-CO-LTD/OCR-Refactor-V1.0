ALTER TABLE "DongilSyncOutbox"
  ADD COLUMN "verifiedAt" TIMESTAMP(3);

ALTER TABLE "DongilHistorySyncRun"
  ADD COLUMN "uploadTotal" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "uploadCompletedAt" TIMESTAMP(3),
  ADD COLUMN "verificationStartedAt" TIMESTAMP(3),
  ADD COLUMN "verificationCompletedAt" TIMESTAMP(3);

UPDATE "DongilSyncOutbox" AS outbox
SET "verifiedAt" = verified."verifiedAt"
FROM (
  SELECT item."outboxId", MAX(item."verifiedAt") AS "verifiedAt"
  FROM "DongilHistorySyncItem" AS item
  WHERE item."verifiedAt" IS NOT NULL
  GROUP BY item."outboxId"
) AS verified
WHERE outbox."id" = verified."outboxId";

UPDATE "DongilHistorySyncRun"
SET "uploadTotal" = "snapshotTotal";

UPDATE "DongilHistorySyncRun"
SET
  "uploadCompletedAt" = "completedAt",
  "verificationStartedAt" = "completedAt",
  "verificationCompletedAt" = "completedAt"
WHERE "state" = 'COMPLETED' AND "completedAt" IS NOT NULL;

CREATE INDEX "DongilSyncOutbox_verifiedAt_status_inspectedAt_idx"
  ON "DongilSyncOutbox"("verifiedAt", "status", "inspectedAt");
