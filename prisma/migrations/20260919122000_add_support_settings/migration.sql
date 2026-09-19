CREATE TABLE "SupportSetting" (
  "id" TEXT NOT NULL DEFAULT 'default',
  "slaWarningMinutes" INTEGER NOT NULL DEFAULT 240,
  "slaBreachMinutes" INTEGER NOT NULL DEFAULT 1440,
  "quickReplies" JSONB NOT NULL DEFAULT '[]',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "SupportSetting_pkey" PRIMARY KEY ("id")
);
