CREATE TYPE "NotificationDeliveryStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'UNKNOWN');

ALTER TABLE "NotificationLog"
ADD COLUMN "status" "NotificationDeliveryStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "lastAttemptAt" TIMESTAMP(3),
ALTER COLUMN "sentAt" DROP NOT NULL,
ALTER COLUMN "sentAt" DROP DEFAULT;

UPDATE "NotificationLog"
SET
  "status" = CASE WHEN "error" IS NULL THEN 'SENT'::"NotificationDeliveryStatus" ELSE 'FAILED'::"NotificationDeliveryStatus" END,
  "attempts" = 1,
  "lastAttemptAt" = COALESCE("sentAt", "createdAt");
