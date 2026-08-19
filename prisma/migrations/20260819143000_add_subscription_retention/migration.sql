ALTER TYPE "SubscriptionStatus" ADD VALUE IF NOT EXISTS 'PAUSED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'SUBSCRIPTION_PAUSED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'SUBSCRIPTION_RESUMED';

CREATE TYPE "RetentionReason" AS ENUM (
  'TOO_EXPENSIVE',
  'CONNECTION_ISSUES',
  'NOT_USING',
  'PAYMENT_PROBLEM',
  'MISSING_REGION',
  'OTHER'
);

CREATE TYPE "RetentionAction" AS ENUM (
  'AUTO_RENEWAL_DISABLED',
  'SUBSCRIPTION_PAUSED',
  'SUBSCRIPTION_RESUMED',
  'SUPPORT_OPENED'
);

CREATE TYPE "RetentionStatus" AS ENUM ('OPEN', 'PAUSED', 'RESUMED', 'CLOSED');

CREATE TABLE "SubscriptionRetention" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "subscriptionId" TEXT,
  "reason" "RetentionReason" NOT NULL,
  "action" "RetentionAction" NOT NULL,
  "status" "RetentionStatus" NOT NULL DEFAULT 'CLOSED',
  "comment" TEXT,
  "remainingSeconds" BIGINT,
  "pauseUntil" TIMESTAMP(3),
  "resumedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SubscriptionRetention_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "SubscriptionRetention"
  ADD CONSTRAINT "SubscriptionRetention_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SubscriptionRetention"
  ADD CONSTRAINT "SubscriptionRetention_subscriptionId_fkey"
  FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "SubscriptionRetention_userId_createdAt_idx"
  ON "SubscriptionRetention"("userId", "createdAt");
CREATE INDEX "SubscriptionRetention_status_pauseUntil_idx"
  ON "SubscriptionRetention"("status", "pauseUntil");
CREATE INDEX "SubscriptionRetention_reason_createdAt_idx"
  ON "SubscriptionRetention"("reason", "createdAt");
