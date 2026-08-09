CREATE TYPE "PaymentEventStage" AS ENUM (
  'ORDER',
  'PROVIDER',
  'WEBHOOK',
  'PAYMENT',
  'PROVISIONING',
  'SUBSCRIPTION',
  'REMNASHOP',
  'NOTIFICATION',
  'REFUND'
);

CREATE TYPE "PaymentEventStatus" AS ENUM ('INFO', 'SUCCESS', 'WARNING', 'ERROR');

CREATE TABLE "PaymentEvent" (
  "id" TEXT NOT NULL,
  "paymentId" TEXT NOT NULL,
  "stage" "PaymentEventStage" NOT NULL,
  "status" "PaymentEventStatus" NOT NULL DEFAULT 'INFO',
  "source" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "details" JSONB,
  "dedupeKey" TEXT,
  "attempts" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PaymentEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PaymentEvent_dedupeKey_key" ON "PaymentEvent"("dedupeKey");
CREATE INDEX "PaymentEvent_paymentId_createdAt_idx" ON "PaymentEvent"("paymentId", "createdAt");
CREATE INDEX "PaymentEvent_status_updatedAt_idx" ON "PaymentEvent"("status", "updatedAt");

ALTER TABLE "PaymentEvent"
  ADD CONSTRAINT "PaymentEvent_paymentId_fkey"
  FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
