ALTER TABLE "Subscription"
ADD COLUMN "graceStartedAt" TIMESTAMP(3),
ADD COLUMN "graceExpireAt" TIMESTAMP(3);

CREATE INDEX "Subscription_graceExpireAt_idx" ON "Subscription"("graceExpireAt");
