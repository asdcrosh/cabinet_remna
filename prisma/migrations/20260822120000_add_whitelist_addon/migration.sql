-- CreateEnum
CREATE TYPE "PaymentPurchaseType" AS ENUM ('SUBSCRIPTION', 'WHITELIST_ADDON');

-- AlterTable
ALTER TABLE "Plan"
  ADD COLUMN "whitelistAddonEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "whitelistAddonPriceKopecks" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "whitelistAddonInternalSquads" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "Subscription"
  ADD COLUMN "whitelistAddonActive" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "whitelistAddonActivatedAt" TIMESTAMP(3),
  ADD COLUMN "whitelistAddonPaymentId" TEXT;

-- AlterTable
ALTER TABLE "Payment"
  ADD COLUMN "purchaseType" "PaymentPurchaseType" NOT NULL DEFAULT 'SUBSCRIPTION',
  ADD COLUMN "addonSnapshot" JSONB;

-- CreateIndex
CREATE INDEX "Payment_purchaseType_status_createdAt_idx" ON "Payment"("purchaseType", "status", "createdAt");
