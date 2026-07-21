ALTER TYPE "PaymentProvider" ADD VALUE 'PLATEGA';

ALTER TABLE "PaymentProviderSetting"
  ADD COLUMN "plategaEnabled" BOOLEAN,
  ADD COLUMN "plategaMerchantId" TEXT,
  ADD COLUMN "plategaSecretEncrypted" TEXT;
