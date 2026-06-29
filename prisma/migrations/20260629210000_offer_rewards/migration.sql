CREATE TYPE "PersonalOfferWelcomeBonusType" AS ENUM (
  'NONE',
  'TRIAL_PLAN',
  'BONUS_BOX_ATTEMPTS'
);

ALTER TABLE "PersonalOfferSetting"
  ADD COLUMN "promoCodeId" TEXT,
  ADD COLUMN "welcomeBonusEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "welcomeBonusType" "PersonalOfferWelcomeBonusType" NOT NULL DEFAULT 'NONE',
  ADD COLUMN "welcomeTrialPlanId" TEXT,
  ADD COLUMN "welcomeBonusAttempts" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "PersonalOfferSetting_promoCodeId_idx" ON "PersonalOfferSetting"("promoCodeId");
CREATE INDEX "PersonalOfferSetting_welcomeTrialPlanId_idx" ON "PersonalOfferSetting"("welcomeTrialPlanId");

ALTER TABLE "PersonalOfferSetting"
  ADD CONSTRAINT "PersonalOfferSetting_promoCodeId_fkey"
  FOREIGN KEY ("promoCodeId") REFERENCES "PromoCode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PersonalOfferSetting"
  ADD CONSTRAINT "PersonalOfferSetting_welcomeTrialPlanId_fkey"
  FOREIGN KEY ("welcomeTrialPlanId") REFERENCES "Plan"("id") ON DELETE SET NULL ON UPDATE CASCADE;
