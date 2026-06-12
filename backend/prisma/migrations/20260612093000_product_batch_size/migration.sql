ALTER TABLE "Product" ADD COLUMN "batchSize" INTEGER;

UPDATE "Product"
SET "batchSize" = "defaultNumber"
WHERE "batchSize" IS NULL;

ALTER TABLE "Product" ALTER COLUMN "batchSize" SET NOT NULL;
ALTER TABLE "Product" ALTER COLUMN "batchSize" SET DEFAULT 160;
