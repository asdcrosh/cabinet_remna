ALTER TABLE "AutoRenewal"
ADD COLUMN "consentAcceptedAt" TIMESTAMP(3),
ADD COLUMN "consentVersion" TEXT,
ADD COLUMN "consentPriceKopecks" INTEGER,
ADD COLUMN "consentDurationDays" INTEGER;

UPDATE "AutoRenewal"
SET
  "status" = 'DISABLED',
  "paymentMethodIdEncrypted" = NULL,
  "paymentMethodTitle" = NULL,
  "paymentMethodSavedAt" = NULL,
  "nextChargeAt" = NULL,
  "disabledAt" = CURRENT_TIMESTAMP,
  "lastError" = 'Требуется явное согласие на автопродление'
WHERE "consentAcceptedAt" IS NULL;
