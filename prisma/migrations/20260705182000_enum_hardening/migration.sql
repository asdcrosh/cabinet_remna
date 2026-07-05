CREATE TYPE "AdminNotificationSeverity" AS ENUM ('INFO', 'SUCCESS', 'WARNING', 'ERROR');
CREATE TYPE "BroadcastSegment" AS ENUM ('ALL', 'ACTIVE', 'NO_ACTIVE', 'EXPIRED', 'NEVER_PURCHASED', 'INACTIVE_N_DAYS');
CREATE TYPE "YookassaPaymentStatus" AS ENUM ('pending', 'waiting_for_capture', 'succeeded', 'canceled');

ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'ADMIN_BONUS_ATTEMPTS_GRANTED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'ADMIN_SUPPORT_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'REMNASHOP_SYNC_RUN';

UPDATE "AdminNotification"
SET "severity" = 'INFO'
WHERE "severity" NOT IN ('INFO', 'SUCCESS', 'WARNING', 'ERROR');

UPDATE "BroadcastCampaign"
SET "segment" = 'INACTIVE_N_DAYS'
WHERE "segment" = 'INACTIVE_45D';

UPDATE "BroadcastCampaign"
SET "segment" = 'ALL'
WHERE "segment" NOT IN ('ALL', 'ACTIVE', 'NO_ACTIVE', 'EXPIRED', 'NEVER_PURCHASED', 'INACTIVE_N_DAYS');

UPDATE "Payment"
SET "yookassaStatus" = NULL
WHERE "yookassaStatus" IS NOT NULL
  AND "yookassaStatus" NOT IN ('pending', 'waiting_for_capture', 'succeeded', 'canceled');

ALTER TABLE "AdminNotification"
  ALTER COLUMN "severity" DROP DEFAULT,
  ALTER COLUMN "severity" TYPE "AdminNotificationSeverity" USING "severity"::"AdminNotificationSeverity",
  ALTER COLUMN "severity" SET DEFAULT 'INFO';

ALTER TABLE "BroadcastCampaign"
  ALTER COLUMN "segment" TYPE "BroadcastSegment" USING "segment"::"BroadcastSegment";

ALTER TABLE "Payment"
  ALTER COLUMN "yookassaStatus" TYPE "YookassaPaymentStatus" USING "yookassaStatus"::"YookassaPaymentStatus";
