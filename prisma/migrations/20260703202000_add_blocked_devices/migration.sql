CREATE TABLE "BlockedDevice" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "hwid" TEXT NOT NULL,
  "reason" TEXT,
  "blockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "unblockedAt" TIMESTAMP(3),

  CONSTRAINT "BlockedDevice_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BlockedDevice_userId_hwid_key" ON "BlockedDevice"("userId", "hwid");
CREATE INDEX "BlockedDevice_userId_idx" ON "BlockedDevice"("userId");
CREATE INDEX "BlockedDevice_userId_unblockedAt_idx" ON "BlockedDevice"("userId", "unblockedAt");

ALTER TABLE "BlockedDevice"
  ADD CONSTRAINT "BlockedDevice_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
