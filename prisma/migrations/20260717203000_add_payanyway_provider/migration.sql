CREATE TYPE "PaymentProvider" AS ENUM ('YOOKASSA', 'PAYANYWAY', 'LOCAL');

ALTER TABLE "Payment"
  ADD COLUMN "provider" "PaymentProvider" NOT NULL DEFAULT 'YOOKASSA',
  ADD COLUMN "externalPaymentId" TEXT,
  ADD COLUMN "providerStatus" TEXT;

UPDATE "Payment"
SET
  "externalPaymentId" = "yookassaId",
  "providerStatus" = "yookassaStatus"::text
WHERE "yookassaId" IS NOT NULL;

UPDATE "Payment"
SET "provider" = 'LOCAL'
WHERE "yookassaId" IS NULL
  AND "status" = 'SUCCEEDED';

CREATE UNIQUE INDEX "Payment_provider_externalPaymentId_key"
  ON "Payment"("provider", "externalPaymentId");

CREATE INDEX "Payment_provider_status_createdAt_idx"
  ON "Payment"("provider", "status", "createdAt");
