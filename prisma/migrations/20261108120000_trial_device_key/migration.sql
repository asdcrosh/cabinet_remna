-- Пробный период из приложения StealthNet: один на телефон.
ALTER TABLE "TrialPlanRedemption" ADD COLUMN "deviceKey" TEXT;

CREATE UNIQUE INDEX "TrialPlanRedemption_deviceKey_key" ON "TrialPlanRedemption"("deviceKey");
