ALTER TYPE "AuditAction" ADD VALUE 'PROMO_CODE_MERGED';

ALTER TABLE "BonusBoxSetting"
  ADD COLUMN "promoMergeEnabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "promoMergeCoefficient" INTEGER NOT NULL DEFAULT 70,
  ADD COLUMN "promoMergeCapPercent" INTEGER NOT NULL DEFAULT 30;

CREATE TABLE "PromoCodeMerge" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "resultPromoCodeId" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "sourcePromoCodeIds" TEXT[],
  "sourceCodes" TEXT[],
  "sourcePercents" INTEGER[],
  "coefficientPercent" INTEGER NOT NULL,
  "capPercent" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PromoCodeMerge_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PromoCodeMerge_resultPromoCodeId_key" ON "PromoCodeMerge"("resultPromoCodeId");
CREATE UNIQUE INDEX "PromoCodeMerge_userId_idempotencyKey_key" ON "PromoCodeMerge"("userId", "idempotencyKey");
CREATE INDEX "PromoCodeMerge_userId_createdAt_idx" ON "PromoCodeMerge"("userId", "createdAt");

ALTER TABLE "PromoCodeMerge" ADD CONSTRAINT "PromoCodeMerge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PromoCodeMerge" ADD CONSTRAINT "PromoCodeMerge_resultPromoCodeId_fkey" FOREIGN KEY ("resultPromoCodeId") REFERENCES "PromoCode"("id") ON DELETE CASCADE ON UPDATE CASCADE;
