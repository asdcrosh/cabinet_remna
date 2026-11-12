CREATE TABLE "TelegramChannelReferral" (
  "referredTelegramId" BIGINT PRIMARY KEY,
  "referredUserId" TEXT NOT NULL UNIQUE,
  "referrerId" TEXT NOT NULL,
  "channelId" TEXT NOT NULL,
  "eligible" BOOLEAN NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "claimedAt" TIMESTAMP(3),
  "referrerPaymentId" TEXT UNIQUE,
  "referredPaymentId" TEXT UNIQUE
);
CREATE INDEX "TelegramChannelReferral_referrerId_claimedAt_idx" ON "TelegramChannelReferral"("referrerId", "claimedAt");
