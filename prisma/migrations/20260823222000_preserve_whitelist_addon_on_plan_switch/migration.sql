ALTER TABLE "Subscription"
ADD COLUMN "whitelistAddonInternalSquads" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

UPDATE "Subscription" AS subscription
SET "whitelistAddonInternalSquads" = plan."whitelistAddonInternalSquads"
FROM "Plan" AS plan
WHERE subscription."planId" = plan.id
  AND subscription."whitelistAddonActive" = true;
