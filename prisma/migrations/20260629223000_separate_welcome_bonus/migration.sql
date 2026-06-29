CREATE TYPE "WelcomeBonusType" AS ENUM (
  'NONE',
  'TRIAL_PLAN',
  'BONUS_BOX_ATTEMPTS',
  'PROMO_CODE'
);

CREATE TABLE "WelcomeBonusSetting" (
  "id" TEXT NOT NULL DEFAULT 'default',
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "type" "WelcomeBonusType" NOT NULL DEFAULT 'NONE',
  "trialPlanId" TEXT,
  "bonusAttempts" INTEGER NOT NULL DEFAULT 0,
  "promoCodeId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "WelcomeBonusSetting_pkey" PRIMARY KEY ("id")
);

INSERT INTO "WelcomeBonusSetting" (
  "id",
  "enabled",
  "type",
  "trialPlanId",
  "bonusAttempts",
  "createdAt",
  "updatedAt"
)
SELECT
  'default',
  "welcomeBonusEnabled",
  "welcomeBonusType"::text::"WelcomeBonusType",
  "welcomeTrialPlanId",
  "welcomeBonusAttempts",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "PersonalOfferSetting"
WHERE "scenario" = 'NO_SUBSCRIPTION'
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "WelcomeBonusSetting" ("id")
VALUES ('default')
ON CONFLICT ("id") DO NOTHING;

CREATE TABLE "WelcomeBonusRedemption" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "type" "WelcomeBonusType" NOT NULL,
  "settingId" TEXT NOT NULL,
  "paymentId" TEXT,
  "promoCodeId" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "WelcomeBonusRedemption_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WelcomeBonusSetting_trialPlanId_idx" ON "WelcomeBonusSetting"("trialPlanId");
CREATE INDEX "WelcomeBonusSetting_promoCodeId_idx" ON "WelcomeBonusSetting"("promoCodeId");
CREATE UNIQUE INDEX "WelcomeBonusRedemption_userId_key" ON "WelcomeBonusRedemption"("userId");
CREATE INDEX "WelcomeBonusRedemption_type_createdAt_idx" ON "WelcomeBonusRedemption"("type", "createdAt");
CREATE INDEX "WelcomeBonusRedemption_promoCodeId_idx" ON "WelcomeBonusRedemption"("promoCodeId");

ALTER TABLE "WelcomeBonusSetting"
  ADD CONSTRAINT "WelcomeBonusSetting_trialPlanId_fkey"
  FOREIGN KEY ("trialPlanId") REFERENCES "Plan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "WelcomeBonusSetting"
  ADD CONSTRAINT "WelcomeBonusSetting_promoCodeId_fkey"
  FOREIGN KEY ("promoCodeId") REFERENCES "PromoCode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "WelcomeBonusRedemption"
  ADD CONSTRAINT "WelcomeBonusRedemption_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WelcomeBonusRedemption"
  ADD CONSTRAINT "WelcomeBonusRedemption_promoCodeId_fkey"
  FOREIGN KEY ("promoCodeId") REFERENCES "PromoCode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PersonalOfferSetting" DROP CONSTRAINT IF EXISTS "PersonalOfferSetting_welcomeTrialPlanId_fkey";
DROP INDEX IF EXISTS "PersonalOfferSetting_welcomeTrialPlanId_idx";
ALTER TABLE "PersonalOfferSetting"
  DROP COLUMN IF EXISTS "welcomeBonusEnabled",
  DROP COLUMN IF EXISTS "welcomeBonusType",
  DROP COLUMN IF EXISTS "welcomeTrialPlanId",
  DROP COLUMN IF EXISTS "welcomeBonusAttempts";

DROP TYPE IF EXISTS "PersonalOfferWelcomeBonusType";
