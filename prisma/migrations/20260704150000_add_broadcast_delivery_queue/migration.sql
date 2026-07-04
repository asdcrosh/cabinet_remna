CREATE TYPE "BroadcastDeliveryStatus" AS ENUM ('PENDING', 'PROCESSING', 'SUCCEEDED', 'FAILED');

CREATE TABLE "BroadcastDelivery" (
  "id" TEXT NOT NULL,
  "campaignId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "status" "BroadcastDeliveryStatus" NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "lastError" TEXT,
  "lockedAt" TIMESTAMP(3),
  "sentAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "BroadcastDelivery_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BroadcastDelivery_campaignId_userId_key" ON "BroadcastDelivery"("campaignId", "userId");
CREATE INDEX "BroadcastDelivery_status_lockedAt_createdAt_idx" ON "BroadcastDelivery"("status", "lockedAt", "createdAt");
CREATE INDEX "BroadcastDelivery_campaignId_status_idx" ON "BroadcastDelivery"("campaignId", "status");
CREATE INDEX "BroadcastDelivery_userId_createdAt_idx" ON "BroadcastDelivery"("userId", "createdAt");

ALTER TABLE "BroadcastDelivery"
  ADD CONSTRAINT "BroadcastDelivery_campaignId_fkey"
  FOREIGN KEY ("campaignId") REFERENCES "BroadcastCampaign"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BroadcastDelivery"
  ADD CONSTRAINT "BroadcastDelivery_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
