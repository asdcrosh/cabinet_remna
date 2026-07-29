ALTER TABLE "PromoCode"
ADD COLUMN "remnashopPromoCodeId" INTEGER;

CREATE UNIQUE INDEX "PromoCode_remnashopPromoCodeId_key"
ON "PromoCode"("remnashopPromoCodeId");
