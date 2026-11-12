ALTER TYPE "NotificationType" ADD VALUE 'PROMO_CODE_EXPIRING';

CREATE TYPE "PromoReminderChannel" AS ENUM ('APP', 'TELEGRAM', 'EMAIL');
CREATE TYPE "PromoReminderStatus" AS ENUM ('PENDING', 'SENDING', 'SENT', 'UNKNOWN', 'SKIPPED');

CREATE TABLE "PromoCodeReminder" (
    "userId" TEXT NOT NULL,
    "promoCodeId" TEXT NOT NULL,
    "channel" "PromoReminderChannel",
    "status" "PromoReminderStatus" NOT NULL DEFAULT 'PENDING',
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PromoCodeReminder_pkey" PRIMARY KEY ("userId", "promoCodeId"),
    CONSTRAINT "PromoCodeReminder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PromoCodeReminder_promoCodeId_fkey" FOREIGN KEY ("promoCodeId") REFERENCES "PromoCode"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "PromoCodeReminder_promoCodeId_status_idx" ON "PromoCodeReminder"("promoCodeId", "status");
CREATE INDEX "PromoCodeReminder_status_updatedAt_idx" ON "PromoCodeReminder"("status", "updatedAt");
