ALTER TYPE "AuditAction" ADD VALUE 'ADMIN_SUBSCRIPTION_DISABLED';
ALTER TYPE "NotificationType" ADD VALUE 'SUBSCRIPTION_TERMINATED';

CREATE TABLE "PaymentRefund" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "providerRefundId" TEXT NOT NULL,
    "amountKopecks" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentRefund_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PaymentRefund_providerRefundId_key"
ON "PaymentRefund"("providerRefundId");

CREATE INDEX "PaymentRefund_paymentId_createdAt_idx"
ON "PaymentRefund"("paymentId", "createdAt");

ALTER TABLE "PaymentRefund"
ADD CONSTRAINT "PaymentRefund_paymentId_fkey"
FOREIGN KEY ("paymentId") REFERENCES "Payment"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
