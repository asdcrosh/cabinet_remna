CREATE TYPE "SubscriptionHealthStatus" AS ENUM ('HEALTHY', 'WARNING', 'ERROR');
CREATE TYPE "SubscriptionHealthAction" AS ENUM ('CHECK', 'AUTO_REPAIR', 'MANUAL_REPAIR');

CREATE TABLE "SubscriptionHealth" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "subscriptionId" TEXT,
    "status" "SubscriptionHealthStatus" NOT NULL DEFAULT 'HEALTHY',
    "issueCount" INTEGER NOT NULL DEFAULT 0,
    "issues" JSONB NOT NULL DEFAULT '[]',
    "snapshots" JSONB,
    "lastError" TEXT,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "repairedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SubscriptionHealth_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SubscriptionHealthEvent" (
    "id" TEXT NOT NULL,
    "healthId" TEXT NOT NULL,
    "action" "SubscriptionHealthAction" NOT NULL,
    "status" "SubscriptionHealthStatus" NOT NULL,
    "issues" JSONB NOT NULL DEFAULT '[]',
    "changes" JSONB,
    "error" TEXT,
    "actorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SubscriptionHealthEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SubscriptionHealth_userId_key" ON "SubscriptionHealth"("userId");
CREATE INDEX "SubscriptionHealth_status_checkedAt_idx" ON "SubscriptionHealth"("status", "checkedAt");
CREATE INDEX "SubscriptionHealth_checkedAt_idx" ON "SubscriptionHealth"("checkedAt");
CREATE INDEX "SubscriptionHealthEvent_healthId_createdAt_idx" ON "SubscriptionHealthEvent"("healthId", "createdAt");
CREATE INDEX "SubscriptionHealthEvent_status_createdAt_idx" ON "SubscriptionHealthEvent"("status", "createdAt");

ALTER TABLE "SubscriptionHealth" ADD CONSTRAINT "SubscriptionHealth_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SubscriptionHealthEvent" ADD CONSTRAINT "SubscriptionHealthEvent_healthId_fkey"
FOREIGN KEY ("healthId") REFERENCES "SubscriptionHealth"("id") ON DELETE CASCADE ON UPDATE CASCADE;
