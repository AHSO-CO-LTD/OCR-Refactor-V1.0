-- Product profiles: each product owns camera and ROI profile data.
ALTER TABLE "Product" ADD COLUMN "code" TEXT;

UPDATE "Product"
SET "code" = "name"
WHERE "code" IS NULL;

ALTER TABLE "Product" ALTER COLUMN "code" SET NOT NULL;
CREATE UNIQUE INDEX "Product_code_key" ON "Product"("code");

ALTER TABLE "CameraConfig" ADD COLUMN "productId" TEXT;
CREATE UNIQUE INDEX "CameraConfig_productId_key" ON "CameraConfig"("productId");
ALTER TABLE "CameraConfig"
  ADD CONSTRAINT "CameraConfig_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RoiPoint" ADD COLUMN "productId" TEXT;
DROP INDEX IF EXISTS "RoiPoint_index_key";
CREATE UNIQUE INDEX "RoiPoint_productId_index_key" ON "RoiPoint"("productId", "index");
ALTER TABLE "RoiPoint"
  ADD CONSTRAINT "RoiPoint_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
