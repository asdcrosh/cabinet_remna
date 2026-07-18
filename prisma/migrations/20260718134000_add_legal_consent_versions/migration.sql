ALTER TABLE "User"
  ADD COLUMN "agreedToTermsVersion" TEXT,
  ADD COLUMN "personalDataConsentAt" TIMESTAMP(3),
  ADD COLUMN "personalDataConsentVersion" TEXT;

UPDATE "User"
SET "agreedToTermsVersion" = 'legacy'
WHERE "agreedToTermsAt" IS NOT NULL
  AND "agreedToTermsVersion" IS NULL;
