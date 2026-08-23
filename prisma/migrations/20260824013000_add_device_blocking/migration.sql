ALTER TABLE "Device"
ADD COLUMN "blockedAt" TIMESTAMP(3);

CREATE INDEX "Device_blockedAt_idx" ON "Device"("blockedAt");
