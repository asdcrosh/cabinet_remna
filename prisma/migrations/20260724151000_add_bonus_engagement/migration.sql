ALTER TYPE "BonusBoxAttemptSource" ADD VALUE 'MISSION';
ALTER TYPE "BonusBoxAttemptSource" ADD VALUE 'SEASONAL_EVENT';

ALTER TYPE "AuditAction" ADD VALUE 'ADMIN_BONUS_MISSION_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'ADMIN_BONUS_MISSION_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'ADMIN_BONUS_EVENT_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'ADMIN_BONUS_EVENT_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'ADMIN_BONUS_RISK_REVIEWED';

CREATE TYPE "BonusBoxMissionType" AS ENUM ('PAYMENT_COUNT', 'REFERRAL_COUNT', 'LOGIN_STREAK');
CREATE TYPE "BonusBoxRiskSignalKind" AS ENUM ('SHARED_FINGERPRINT', 'SELF_REFERRAL', 'EXCESSIVE_BALANCE');

ALTER TABLE "BonusBoxPrize"
ADD COLUMN "estimatedCostKopecks" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "eventOnly" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "BonusBoxOpening"
ADD COLUMN "expectedChance" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN "expectedDistribution" JSONB,
ADD COLUMN "seasonalEventId" TEXT;

CREATE TABLE "BonusBoxMission" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "type" "BonusBoxMissionType" NOT NULL,
  "target" INTEGER NOT NULL,
  "rewardAttempts" INTEGER NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "startsAt" TIMESTAMP(3),
  "endsAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BonusBoxMission_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BonusBoxMissionProgress" (
  "id" TEXT NOT NULL,
  "missionId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "value" INTEGER NOT NULL DEFAULT 0,
  "metadata" JSONB,
  "lastProgressAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "claimedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BonusBoxMissionProgress_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BonusBoxEvent" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "startsAt" TIMESTAMP(3) NOT NULL,
  "endsAt" TIMESTAMP(3) NOT NULL,
  "attemptsPerUser" INTEGER NOT NULL DEFAULT 0,
  "weightMultiplier" INTEGER NOT NULL DEFAULT 2,
  "prizeIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "maxClaims" INTEGER,
  "claimsCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BonusBoxEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BonusBoxEventClaim" (
  "id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "attemptsGranted" INTEGER NOT NULL,
  "claimedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BonusBoxEventClaim_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BonusBoxRiskSignal" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "kind" "BonusBoxRiskSignalKind" NOT NULL,
  "keyHash" TEXT NOT NULL,
  "score" INTEGER NOT NULL,
  "details" JSONB,
  "reviewedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BonusBoxRiskSignal_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "BonusBoxMission_isActive_startsAt_endsAt_idx"
ON "BonusBoxMission"("isActive", "startsAt", "endsAt");

CREATE UNIQUE INDEX "BonusBoxMissionProgress_missionId_userId_key"
ON "BonusBoxMissionProgress"("missionId", "userId");

CREATE INDEX "BonusBoxMissionProgress_userId_claimedAt_updatedAt_idx"
ON "BonusBoxMissionProgress"("userId", "claimedAt", "updatedAt");

CREATE INDEX "BonusBoxEvent_isActive_startsAt_endsAt_idx"
ON "BonusBoxEvent"("isActive", "startsAt", "endsAt");

CREATE UNIQUE INDEX "BonusBoxEventClaim_eventId_userId_key"
ON "BonusBoxEventClaim"("eventId", "userId");

CREATE INDEX "BonusBoxEventClaim_userId_claimedAt_idx"
ON "BonusBoxEventClaim"("userId", "claimedAt");

CREATE UNIQUE INDEX "BonusBoxRiskSignal_userId_kind_keyHash_key"
ON "BonusBoxRiskSignal"("userId", "kind", "keyHash");

CREATE INDEX "BonusBoxRiskSignal_reviewedAt_score_createdAt_idx"
ON "BonusBoxRiskSignal"("reviewedAt", "score", "createdAt");

CREATE INDEX "BonusBoxRiskSignal_kind_keyHash_createdAt_idx"
ON "BonusBoxRiskSignal"("kind", "keyHash", "createdAt");

CREATE INDEX "BonusBoxOpening_seasonalEventId_createdAt_idx"
ON "BonusBoxOpening"("seasonalEventId", "createdAt");

ALTER TABLE "BonusBoxMissionProgress"
ADD CONSTRAINT "BonusBoxMissionProgress_missionId_fkey"
FOREIGN KEY ("missionId") REFERENCES "BonusBoxMission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BonusBoxMissionProgress"
ADD CONSTRAINT "BonusBoxMissionProgress_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BonusBoxEventClaim"
ADD CONSTRAINT "BonusBoxEventClaim_eventId_fkey"
FOREIGN KEY ("eventId") REFERENCES "BonusBoxEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BonusBoxEventClaim"
ADD CONSTRAINT "BonusBoxEventClaim_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BonusBoxRiskSignal"
ADD CONSTRAINT "BonusBoxRiskSignal_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BonusBoxOpening"
ADD CONSTRAINT "BonusBoxOpening_seasonalEventId_fkey"
FOREIGN KEY ("seasonalEventId") REFERENCES "BonusBoxEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "BonusBoxMission" (
  "id", "title", "description", "type", "target", "rewardAttempts", "isActive", "updatedAt"
) VALUES
  (
    'default-payment',
    'Оплатить тариф',
    'Совершите успешную оплату тарифа.',
    'PAYMENT_COUNT',
    1,
    1,
    true,
    CURRENT_TIMESTAMP
  ),
  (
    'default-referral',
    'Пригласить друга',
    'Друг должен зарегистрироваться по ссылке и впервые оплатить тариф.',
    'REFERRAL_COUNT',
    1,
    2,
    true,
    CURRENT_TIMESTAMP
  ),
  (
    'default-login-streak',
    'Зайти три дня подряд',
    'Открывайте кабинет каждый день, не прерывая серию.',
    'LOGIN_STREAK',
    3,
    1,
    true,
    CURRENT_TIMESTAMP
  );
