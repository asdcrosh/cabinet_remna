-- Give every whitelist add-on an independent 30-day lifetime.
ALTER TABLE "Subscription"
  ADD COLUMN "whitelistAddonExpireAt" TIMESTAMP(3);

-- Existing purchases keep 30 days counted from their successful payment.
UPDATE "Subscription" AS s
SET "whitelistAddonExpireAt" = COALESCE(
  p."paidAt",
  p."subscriptionProvisionedAt",
  s."whitelistAddonActivatedAt",
  s."updatedAt"
) + INTERVAL '30 days'
FROM "Payment" AS p
WHERE s."whitelistAddonActive" = true
  AND s."whitelistAddonPaymentId" = p."id";

UPDATE "Subscription"
SET "whitelistAddonExpireAt" = COALESCE("whitelistAddonActivatedAt", "updatedAt") + INTERVAL '30 days'
WHERE "whitelistAddonActive" = true
  AND "whitelistAddonExpireAt" IS NULL;

CREATE INDEX "Subscription_whitelistAddonActive_whitelistAddonExpireAt_idx"
  ON "Subscription"("whitelistAddonActive", "whitelistAddonExpireAt");
