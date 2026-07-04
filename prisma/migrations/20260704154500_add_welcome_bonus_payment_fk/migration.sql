UPDATE "WelcomeBonusRedemption" redemption
SET "paymentId" = NULL
WHERE "paymentId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "Payment" payment
    WHERE payment."id" = redemption."paymentId"
  );

CREATE INDEX "WelcomeBonusRedemption_paymentId_idx" ON "WelcomeBonusRedemption"("paymentId");

ALTER TABLE "WelcomeBonusRedemption"
  ADD CONSTRAINT "WelcomeBonusRedemption_paymentId_fkey"
  FOREIGN KEY ("paymentId") REFERENCES "Payment"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
