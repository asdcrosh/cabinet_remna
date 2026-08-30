ALTER TABLE "Subscription"
  ADD COLUMN "whitelistAddonPausedAt" TIMESTAMP(3),
  ADD COLUMN "whitelistAddonRemainingSeconds" BIGINT;

CREATE INDEX "Subscription_whitelistAddonRemainingSeconds_idx"
  ON "Subscription"("whitelistAddonRemainingSeconds");
