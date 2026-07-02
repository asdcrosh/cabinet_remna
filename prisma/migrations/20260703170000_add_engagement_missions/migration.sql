ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'MISSION_COMPLETED';
ALTER TYPE "BonusBoxAttemptSource" ADD VALUE IF NOT EXISTS 'MISSION';

CREATE TYPE "MissionRewardType" AS ENUM ('BONUS_BOX_ATTEMPTS', 'PROMO_CODE_PERCENT');

CREATE TABLE "MissionDefinition" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "goal" INTEGER NOT NULL DEFAULT 1,
    "rewardType" "MissionRewardType" NOT NULL,
    "rewardValue" INTEGER NOT NULL DEFAULT 1,
    "rewardConfig" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MissionDefinition_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "UserMissionProgress" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "missionId" TEXT NOT NULL,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "goal" INTEGER NOT NULL DEFAULT 1,
    "completedAt" TIMESTAMP(3),
    "claimedAt" TIMESTAMP(3),
    "rewardMetadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserMissionProgress_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "UserEngagementEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "eventKey" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,

    CONSTRAINT "UserEngagementEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MissionDefinition_key_key" ON "MissionDefinition"("key");
CREATE INDEX "MissionDefinition_isActive_sortOrder_idx" ON "MissionDefinition"("isActive", "sortOrder");

CREATE UNIQUE INDEX "UserMissionProgress_userId_missionId_key" ON "UserMissionProgress"("userId", "missionId");
CREATE INDEX "UserMissionProgress_userId_claimedAt_idx" ON "UserMissionProgress"("userId", "claimedAt");

CREATE UNIQUE INDEX "UserEngagementEvent_userId_type_eventKey_key" ON "UserEngagementEvent"("userId", "type", "eventKey");
CREATE INDEX "UserEngagementEvent_userId_type_occurredAt_idx" ON "UserEngagementEvent"("userId", "type", "occurredAt");

ALTER TABLE "UserMissionProgress" ADD CONSTRAINT "UserMissionProgress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserMissionProgress" ADD CONSTRAINT "UserMissionProgress_missionId_fkey" FOREIGN KEY ("missionId") REFERENCES "MissionDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserEngagementEvent" ADD CONSTRAINT "UserEngagementEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
