ALTER TABLE "Plan"
ADD COLUMN "deviceAddonEnabled" BOOLEAN NOT NULL DEFAULT false;

UPDATE "Plan"
SET "deviceAddonEnabled" = true
WHERE "maxDeviceLimit" > "deviceLimit"
  AND "extraDevicePriceKopecks" > 0;
