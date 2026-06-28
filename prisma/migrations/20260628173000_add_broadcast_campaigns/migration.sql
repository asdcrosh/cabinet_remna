-- CreateTable
CREATE TABLE "BroadcastCampaign" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "segment" TEXT NOT NULL,
    "channels" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "actionHref" TEXT,
    "actionLabel" TEXT,
    "imageUrl" TEXT,
    "recipients" INTEGER NOT NULL DEFAULT 0,
    "inAppCount" INTEGER NOT NULL DEFAULT 0,
    "telegramSent" INTEGER NOT NULL DEFAULT 0,
    "telegramSkipped" INTEGER NOT NULL DEFAULT 0,
    "telegramDuplicate" INTEGER NOT NULL DEFAULT 0,
    "telegramFailed" INTEGER NOT NULL DEFAULT 0,
    "emailSent" INTEGER NOT NULL DEFAULT 0,
    "emailSkipped" INTEGER NOT NULL DEFAULT 0,
    "emailDuplicate" INTEGER NOT NULL DEFAULT 0,
    "emailFailed" INTEGER NOT NULL DEFAULT 0,
    "limited" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BroadcastCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BroadcastCampaign_createdAt_idx" ON "BroadcastCampaign"("createdAt");

-- CreateIndex
CREATE INDEX "BroadcastCampaign_createdById_createdAt_idx" ON "BroadcastCampaign"("createdById", "createdAt");

-- AddForeignKey
ALTER TABLE "BroadcastCampaign" ADD CONSTRAINT "BroadcastCampaign_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
