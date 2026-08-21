-- Preserve the paid device count across automatic renewals.
ALTER TABLE "AutoRenewal"
  ADD COLUMN "deviceLimit" INTEGER;

UPDATE "AutoRenewal" AS renewal
SET "deviceLimit" = COALESCE(
  (
    SELECT subscription."deviceLimit"
    FROM "Subscription" AS subscription
    WHERE subscription."userId" = renewal."userId"
      AND subscription."status" IN ('ACTIVE', 'LIMITED', 'PAUSED')
    ORDER BY subscription."expireAt" DESC
    LIMIT 1
  ),
  plan."deviceLimit"
)
FROM "Plan" AS plan
WHERE renewal."planId" = plan."id";

ALTER TABLE "AutoRenewal"
  ALTER COLUMN "deviceLimit" SET NOT NULL,
  ALTER COLUMN "deviceLimit" SET DEFAULT 5;

ALTER TABLE "AutoRenewal"
  ADD CONSTRAINT "AutoRenewal_device_limit_check"
  CHECK ("deviceLimit" > 0);
