CREATE TYPE "PromoCodePurchaseScope" AS ENUM ('ANY', 'RENEWAL_ONLY');

ALTER TABLE "PromoCode"
  ADD COLUMN "purchaseScope" "PromoCodePurchaseScope" NOT NULL DEFAULT 'ANY';
