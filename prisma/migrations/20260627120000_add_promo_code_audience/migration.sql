CREATE TYPE "PromoCodeAudience" AS ENUM ('ALL', 'NEW_USERS', 'NO_ACTIVE_SUBSCRIPTION', 'PERSONAL');

ALTER TABLE "PromoCode"
  ADD COLUMN "audience" "PromoCodeAudience" NOT NULL DEFAULT 'ALL',
  ADD COLUMN "allowedEmails" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

CREATE INDEX "PromoCode_audience_idx" ON "PromoCode"("audience");
