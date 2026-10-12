CREATE TABLE "RememberedLogin" (
  "id" TEXT NOT NULL DEFAULT 'default',
  "userId" TEXT NOT NULL,
  "machineId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "roleCodeAtSave" "RoleCode" NOT NULL,
  "enabledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastRestoredAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "RememberedLogin_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RememberedLogin_userId_key"
  ON "RememberedLogin"("userId");
CREATE UNIQUE INDEX "RememberedLogin_machineId_key"
  ON "RememberedLogin"("machineId");
CREATE UNIQUE INDEX "RememberedLogin_tokenHash_key"
  ON "RememberedLogin"("tokenHash");

ALTER TABLE "RememberedLogin"
  ADD CONSTRAINT "RememberedLogin_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
