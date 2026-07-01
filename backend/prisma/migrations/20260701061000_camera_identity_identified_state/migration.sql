ALTER TABLE "CameraIdentity" ADD COLUMN "identifiedAt" TIMESTAMP(3);

ALTER TABLE "CameraIdentity" ALTER COLUMN "active" SET DEFAULT false;
