CREATE TABLE "CameraIdentity" (
    "id" TEXT NOT NULL,
    "serial" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "driver" TEXT NOT NULL DEFAULT 'basler_area',
    "modelName" TEXT,
    "vendor" TEXT,
    "interfaceName" TEXT,
    "toolName" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastSeenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CameraIdentity_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CameraIdentity_serial_key" ON "CameraIdentity"("serial");

ALTER TABLE "CameraConfig" ADD COLUMN "cameraIdentityId" TEXT;

ALTER TABLE "CameraConfig"
  ADD CONSTRAINT "CameraConfig_cameraIdentityId_fkey"
  FOREIGN KEY ("cameraIdentityId")
  REFERENCES "CameraIdentity"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;
