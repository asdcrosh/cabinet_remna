ALTER TABLE "WelcomeBonusSetting"
  ADD COLUMN IF NOT EXISTS "trialEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "bonusAttemptsEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "promoCodeEnabled" BOOLEAN NOT NULL DEFAULT false;

UPDATE "WelcomeBonusSetting"
SET
  "trialEnabled" = CASE WHEN "type" = 'TRIAL_PLAN' THEN true ELSE "trialEnabled" END,
  "bonusAttemptsEnabled" = CASE WHEN "type" = 'BONUS_BOX_ATTEMPTS' THEN true ELSE "bonusAttemptsEnabled" END,
  "promoCodeEnabled" = CASE WHEN "type" = 'PROMO_CODE' THEN true ELSE "promoCodeEnabled" END;
