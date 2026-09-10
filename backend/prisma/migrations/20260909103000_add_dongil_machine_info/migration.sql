CREATE TABLE "DongilMachineInfo" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "serverUrl" TEXT NOT NULL,
    "machineId" TEXT NOT NULL,
    "displayName" TEXT,
    "isActive" BOOLEAN NOT NULL,
    "factoryName" TEXT,
    "lineName" TEXT,
    "stationName" TEXT,
    "lastSyncedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DongilMachineInfo_pkey" PRIMARY KEY ("id")
);
