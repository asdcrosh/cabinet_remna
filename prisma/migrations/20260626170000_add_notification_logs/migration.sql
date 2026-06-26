CREATE TYPE "NotificationType" AS ENUM (
  'PAYMENT_SUCCESS',
  'PAYMENT_FAILED',
  'PAYMENT_STUCK',
  'SUBSCRIPTION_EXPIRING',
  'TRAFFIC_LIMIT',
  'SUPPORT_REPLY',
  'BONUS_GRANTED'
);

CREATE TYPE "NotificationChannel" AS ENUM ('TELEGRAM', 'EMAIL');

CREATE TABLE "NotificationLog" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "type" "NotificationType" NOT NULL,
  "channel" "NotificationChannel" NOT NULL,
  "dedupeKey" TEXT NOT NULL,
  "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "error" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "NotificationLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "NotificationLog_channel_dedupeKey_key" ON "NotificationLog"("channel", "dedupeKey");
CREATE INDEX "NotificationLog_userId_type_sentAt_idx" ON "NotificationLog"("userId", "type", "sentAt");

ALTER TABLE "NotificationLog"
  ADD CONSTRAINT "NotificationLog_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
