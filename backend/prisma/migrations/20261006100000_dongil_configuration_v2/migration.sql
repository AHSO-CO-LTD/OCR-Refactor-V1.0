ALTER TABLE "DongilSyncConfiguration"
  ALTER COLUMN "serverUrl" DROP NOT NULL,
  ALTER COLUMN "machineId" DROP NOT NULL,
  ALTER COLUMN "licenseStatus" DROP NOT NULL,
  ADD COLUMN "configVersion" INTEGER NOT NULL DEFAULT 2,
  ADD COLUMN "legacyEnvImportedAt" TIMESTAMP(3);
