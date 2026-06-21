-- CreateEnum
CREATE TYPE "PromoCodeRedemptionStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'CANCELED');

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN "discountKopecks" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "discountPercent" INTEGER,
ADD COLUMN "originalAmountKopecks" INTEGER,
ADD COLUMN "promoCodeId" TEXT,
ADD COLUMN "promoCodeSnapshot" JSONB;

-- CreateTable
CREATE TABLE "PromoCode" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "discountPercent" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "startsAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "maxUses" INTEGER,
    "maxUsesPerUser" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PromoCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromoCodePlan" (
    "promoCodeId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,

    CONSTRAINT "PromoCodePlan_pkey" PRIMARY KEY ("promoCodeId","planId")
);

-- CreateTable
CREATE TABLE "PromoCodeRedemption" (
    "id" TEXT NOT NULL,
    "promoCodeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "status" "PromoCodeRedemptionStatus" NOT NULL DEFAULT 'PENDING',
    "codeSnapshot" TEXT NOT NULL,
    "discountPercent" INTEGER NOT NULL,
    "discountKopecks" INTEGER NOT NULL,
    "originalAmountKopecks" INTEGER NOT NULL,
    "finalAmountKopecks" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PromoCodeRedemption_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PromoCode_code_key" ON "PromoCode"("code");

-- CreateIndex
CREATE INDEX "PromoCode_isActive_startsAt_expiresAt_idx" ON "PromoCode"("isActive", "startsAt", "expiresAt");

-- CreateIndex
CREATE INDEX "PromoCodePlan_planId_idx" ON "PromoCodePlan"("planId");

-- CreateIndex
CREATE UNIQUE INDEX "PromoCodeRedemption_paymentId_key" ON "PromoCodeRedemption"("paymentId");

-- CreateIndex
CREATE INDEX "PromoCodeRedemption_promoCodeId_status_idx" ON "PromoCodeRedemption"("promoCodeId", "status");

-- CreateIndex
CREATE INDEX "PromoCodeRedemption_userId_promoCodeId_status_idx" ON "PromoCodeRedemption"("userId", "promoCodeId", "status");

-- CreateIndex
CREATE INDEX "Payment_promoCodeId_idx" ON "Payment"("promoCodeId");

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_promoCodeId_fkey" FOREIGN KEY ("promoCodeId") REFERENCES "PromoCode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromoCodePlan" ADD CONSTRAINT "PromoCodePlan_promoCodeId_fkey" FOREIGN KEY ("promoCodeId") REFERENCES "PromoCode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromoCodePlan" ADD CONSTRAINT "PromoCodePlan_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromoCodeRedemption" ADD CONSTRAINT "PromoCodeRedemption_promoCodeId_fkey" FOREIGN KEY ("promoCodeId") REFERENCES "PromoCode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromoCodeRedemption" ADD CONSTRAINT "PromoCodeRedemption_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromoCodeRedemption" ADD CONSTRAINT "PromoCodeRedemption_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
