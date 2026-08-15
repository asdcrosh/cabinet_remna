-- CreateEnum
CREATE TYPE "AdminTelegramDeliveryStatus" AS ENUM ('PENDING', 'PROCESSING', 'RETRYING', 'SENT', 'FAILED');

-- CreateTable
CREATE TABLE "AdminTelegramDelivery" (
    "id" TEXT NOT NULL,
    "notificationId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "actionHref" TEXT,
    "actionLabel" TEXT,
    "status" "AdminTelegramDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextRetryAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "telegramMessageId" TEXT,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminTelegramDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AdminTelegramDelivery_notificationId_key" ON "AdminTelegramDelivery"("notificationId");

-- CreateIndex
CREATE INDEX "AdminTelegramDelivery_status_nextRetryAt_idx" ON "AdminTelegramDelivery"("status", "nextRetryAt");

-- CreateIndex
CREATE INDEX "AdminTelegramDelivery_status_lockedAt_idx" ON "AdminTelegramDelivery"("status", "lockedAt");

-- AddForeignKey
ALTER TABLE "AdminTelegramDelivery" ADD CONSTRAINT "AdminTelegramDelivery_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "AdminNotification"("id") ON DELETE CASCADE ON UPDATE CASCADE;
