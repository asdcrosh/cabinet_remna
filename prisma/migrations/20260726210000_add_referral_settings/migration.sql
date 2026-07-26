CREATE TYPE "ReferralRewardTrigger" AS ENUM ('REGISTRATION', 'FIRST_PAYMENT');

CREATE TABLE "ReferralSetting" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "trigger" "ReferralRewardTrigger" NOT NULL DEFAULT 'FIRST_PAYMENT',
    "minimumPaymentKopecks" INTEGER NOT NULL DEFAULT 0,
    "maxRewardsPerReferrer" INTEGER NOT NULL DEFAULT 0,
    "referrerBonusDays" INTEGER NOT NULL DEFAULT 7,
    "referredBonusDays" INTEGER NOT NULL DEFAULT 0,
    "referrerAttempts" INTEGER NOT NULL DEFAULT 2,
    "referredAttempts" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReferralSetting_pkey" PRIMARY KEY ("id")
);

INSERT INTO "ReferralSetting" (
    "id",
    "trigger",
    "minimumPaymentKopecks",
    "maxRewardsPerReferrer",
    "referrerBonusDays",
    "referredBonusDays",
    "referrerAttempts",
    "referredAttempts",
    "updatedAt"
) VALUES (
    'default',
    'FIRST_PAYMENT',
    0,
    0,
    7,
    0,
    2,
    1,
    CURRENT_TIMESTAMP
);

ALTER TABLE "ReferralReward"
    ALTER COLUMN "triggeringPaymentId" DROP NOT NULL,
    ADD COLUMN "trigger" "ReferralRewardTrigger" NOT NULL DEFAULT 'FIRST_PAYMENT',
    ADD COLUMN "referredBonusDays" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "referrerAttempts" INTEGER NOT NULL DEFAULT 2,
    ADD COLUMN "referredAttempts" INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN "referredAppliedSubscriptionId" TEXT,
    ADD COLUMN "referredAppliedAt" TIMESTAMP(3);

ALTER TYPE "AuditAction" ADD VALUE 'ADMIN_REFERRAL_SETTINGS_UPDATED';
