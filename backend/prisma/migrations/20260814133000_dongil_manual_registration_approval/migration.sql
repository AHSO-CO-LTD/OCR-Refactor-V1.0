ALTER TABLE "DongilSyncConfiguration"
  ADD COLUMN "registrationStatus" TEXT,
  ADD COLUMN "autoConnectEnabled" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "DongilSyncConfiguration"
  ALTER COLUMN "autoConnectEnabled" SET DEFAULT false;
