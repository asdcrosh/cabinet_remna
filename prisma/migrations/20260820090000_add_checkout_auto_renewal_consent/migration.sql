ALTER TABLE "Payment"
ADD COLUMN "autoRenewalConsentAcceptedAt" TIMESTAMP(3),
ADD COLUMN "autoRenewalConsentVersion" TEXT;
