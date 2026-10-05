ALTER TYPE "DongilHistorySyncRunState" ADD VALUE 'CANCELLED';

ALTER TABLE "DongilHistorySyncRun"
  ADD COLUMN "cancelledAt" TIMESTAMP(3);
