-- CreateEnum
CREATE TYPE "TestSessionImageResult" AS ENUM ('OK', 'NG', 'UNKNOWN', 'ERROR');

-- CreateTable
CREATE TABLE "TestSessionReport" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "folderName" TEXT,
    "totalImages" INTEGER NOT NULL,
    "okImages" INTEGER NOT NULL,
    "ngImages" INTEGER NOT NULL,
    "unknownImages" INTEGER NOT NULL DEFAULT 0,
    "errorImages" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TestSessionReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TestSessionFailedImage" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "relativePath" TEXT NOT NULL,
    "result" "TestSessionImageResult" NOT NULL,
    "cycleTimeMs" INTEGER,
    "errorMessage" TEXT,
    "originalImageBase64" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TestSessionFailedImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TestSessionFailedRoiResult" (
    "id" TEXT NOT NULL,
    "failedImageId" TEXT NOT NULL,
    "slotIndex" INTEGER,
    "slotLabel" TEXT,
    "expectedText" TEXT,
    "rawText" TEXT,
    "result" "InspectionResult" NOT NULL DEFAULT 'UNKNOWN',
    "errorMessage" TEXT,
    "toolDebugImageBase64" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TestSessionFailedRoiResult_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TestSessionReport_productId_createdAt_idx" ON "TestSessionReport"("productId", "createdAt");

-- CreateIndex
CREATE INDEX "TestSessionReport_actorId_createdAt_idx" ON "TestSessionReport"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "TestSessionFailedImage_reportId_createdAt_idx" ON "TestSessionFailedImage"("reportId", "createdAt");

-- CreateIndex
CREATE INDEX "TestSessionFailedRoiResult_failedImageId_slotIndex_idx" ON "TestSessionFailedRoiResult"("failedImageId", "slotIndex");

-- AddForeignKey
ALTER TABLE "TestSessionReport" ADD CONSTRAINT "TestSessionReport_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TestSessionReport" ADD CONSTRAINT "TestSessionReport_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TestSessionFailedImage" ADD CONSTRAINT "TestSessionFailedImage_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "TestSessionReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TestSessionFailedRoiResult" ADD CONSTRAINT "TestSessionFailedRoiResult_failedImageId_fkey" FOREIGN KEY ("failedImageId") REFERENCES "TestSessionFailedImage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
