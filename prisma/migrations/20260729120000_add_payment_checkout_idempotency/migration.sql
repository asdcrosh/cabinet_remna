ALTER TABLE "Payment"
ADD COLUMN "checkoutKey" TEXT;

CREATE UNIQUE INDEX "Payment_userId_checkoutKey_key"
ON "Payment"("userId", "checkoutKey");
