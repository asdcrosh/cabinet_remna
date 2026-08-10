CREATE TABLE "BrandSetting" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "logoUrl" TEXT,
    "accentColor" TEXT NOT NULL DEFAULT '#d832d4',
    "accentSecondaryColor" TEXT NOT NULL DEFAULT '#5424bc',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BrandSetting_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "UserNotificationPreference" (
    "userId" TEXT NOT NULL,
    "inAppEnabled" BOOLEAN NOT NULL DEFAULT true,
    "telegramEnabled" BOOLEAN NOT NULL DEFAULT true,
    "emailEnabled" BOOLEAN NOT NULL DEFAULT true,
    "broadcastsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserNotificationPreference_pkey" PRIMARY KEY ("userId")
);

ALTER TABLE "UserNotificationPreference"
ADD CONSTRAINT "UserNotificationPreference_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

DELETE FROM "UserNotification" WHERE "type" = 'BONUS_GRANTED';
