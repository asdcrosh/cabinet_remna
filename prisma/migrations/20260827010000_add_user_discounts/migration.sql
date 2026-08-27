ALTER TABLE "User"
ADD COLUMN "personalDiscountPercent" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "nextPurchaseDiscountPercent" INTEGER NOT NULL DEFAULT 0;

CREATE TYPE "UserDiscountType" AS ENUM ('PERSONAL', 'NEXT_PURCHASE');

ALTER TABLE "Payment"
ADD COLUMN "userDiscountType" "UserDiscountType";

ALTER TABLE "User"
ADD CONSTRAINT "User_personalDiscountPercent_check"
CHECK ("personalDiscountPercent" BETWEEN 0 AND 99),
ADD CONSTRAINT "User_nextPurchaseDiscountPercent_check"
CHECK ("nextPurchaseDiscountPercent" BETWEEN 0 AND 99);
