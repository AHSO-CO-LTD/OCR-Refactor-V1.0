ALTER TABLE "DongilSyncOutbox"
ADD COLUMN "okCount" INTEGER,
ADD COLUMN "ngCount" INTEGER;

ALTER TABLE "DongilSyncOutbox"
ADD CONSTRAINT "DongilSyncOutbox_washing_counts_pair_check"
CHECK (
  ("okCount" IS NULL AND "ngCount" IS NULL)
  OR
  ("okCount" IS NOT NULL AND "ngCount" IS NOT NULL AND "okCount" >= 0 AND "ngCount" >= 0)
);
