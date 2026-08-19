-- CreateEnum
CREATE TYPE "PaymentOrigin" AS ENUM ('MANUAL', 'AUTO_RENEWAL');

-- CreateEnum
CREATE TYPE "AutoRenewalStatus" AS ENUM ('AWAITING_PAYMENT_METHOD', 'ACTIVE', 'PROCESSING', 'RETRYING', 'PAUSED', 'DISABLED');

-- AlterTable
ALTER TABLE "Payment"
ADD COLUMN "autoRenewalId" TEXT,
ADD COLUMN "origin" "PaymentOrigin" NOT NULL DEFAULT 'MANUAL';

-- CreateTable
CREATE TABLE "AutoRenewal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "status" "AutoRenewalStatus" NOT NULL DEFAULT 'AWAITING_PAYMENT_METHOD',
    "paymentMethodIdEncrypted" TEXT,
    "paymentMethodTitle" TEXT,
    "paymentMethodSavedAt" TIMESTAMP(3),
    "nextChargeAt" TIMESTAMP(3),
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "lastAttemptAt" TIMESTAMP(3),
    "lastSuccessAt" TIMESTAMP(3),
    "lastFailurePaymentId" TEXT,
    "lastError" TEXT,
    "disabledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutoRenewal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AutoRenewal_userId_key" ON "AutoRenewal"("userId");
CREATE INDEX "AutoRenewal_status_nextChargeAt_idx" ON "AutoRenewal"("status", "nextChargeAt");
CREATE INDEX "AutoRenewal_planId_idx" ON "AutoRenewal"("planId");
CREATE INDEX "Payment_autoRenewalId_createdAt_idx" ON "Payment"("autoRenewalId", "createdAt");

-- AddForeignKey
ALTER TABLE "AutoRenewal" ADD CONSTRAINT "AutoRenewal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AutoRenewal" ADD CONSTRAINT "AutoRenewal_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_autoRenewalId_fkey" FOREIGN KEY ("autoRenewalId") REFERENCES "AutoRenewal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
