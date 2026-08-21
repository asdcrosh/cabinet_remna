-- Variable device limits and immutable purchase snapshots.
ALTER TABLE "Plan"
  ADD COLUMN "maxDeviceLimit" INTEGER,
  ADD COLUMN "extraDevicePriceKopecks" INTEGER NOT NULL DEFAULT 0;

UPDATE "Plan"
SET "maxDeviceLimit" = "deviceLimit";

ALTER TABLE "Plan"
  ALTER COLUMN "maxDeviceLimit" SET NOT NULL,
  ALTER COLUMN "maxDeviceLimit" SET DEFAULT 5;

ALTER TABLE "Subscription"
  ADD COLUMN "deviceLimit" INTEGER;

ALTER TABLE "Payment"
  ADD COLUMN "deviceLimit" INTEGER,
  ADD COLUMN "planSnapshot" JSONB;

UPDATE "Payment" AS payment
SET "deviceLimit" = plan."deviceLimit",
    "planSnapshot" = jsonb_build_object(
      'version', 1,
      'id', plan."id",
      'name', plan."name",
      'durationDays', plan."durationDays",
      'trafficLimitGb', plan."trafficLimitGb",
      'baseDeviceLimit', plan."deviceLimit",
      'maxDeviceLimit', plan."deviceLimit",
      'selectedDeviceLimit', plan."deviceLimit",
      'extraDevicePriceKopecks', 0,
      'extraDeviceCount', 0,
      'extraDeviceAmountKopecks', 0,
      'basePriceKopecks', plan."priceKopecks",
      'originalAmountKopecks', COALESCE(payment."originalAmountKopecks", payment."amountKopecks"),
      'activeInternalSquads', to_jsonb(plan."activeInternalSquads"),
      'deviceLimitSelectionConfirmed', false
    )
FROM "Plan" AS plan
WHERE payment."planId" = plan."id";

ALTER TABLE "Plan"
  ADD CONSTRAINT "Plan_device_limits_check"
  CHECK (
    "deviceLimit" > 0
    AND "maxDeviceLimit" >= "deviceLimit"
    AND "extraDevicePriceKopecks" >= 0
  );

ALTER TABLE "Subscription"
  ADD CONSTRAINT "Subscription_device_limit_check"
  CHECK ("deviceLimit" IS NULL OR "deviceLimit" > 0);

ALTER TABLE "Payment"
  ADD CONSTRAINT "Payment_device_limit_check"
  CHECK ("deviceLimit" IS NULL OR "deviceLimit" > 0);
