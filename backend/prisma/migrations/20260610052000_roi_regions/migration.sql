-- ROI is a rectangular inspection region, not a single point.
CREATE TABLE "RoiRegion" (
    "id" TEXT NOT NULL,
    "productId" TEXT,
    "index" INTEGER NOT NULL,
    "x" INTEGER NOT NULL,
    "y" INTEGER NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "rotation" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoiRegion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RoiRegion_productId_index_key" ON "RoiRegion"("productId", "index");

ALTER TABLE "RoiRegion"
  ADD CONSTRAINT "RoiRegion_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

DROP TABLE IF EXISTS "RoiPoint";
