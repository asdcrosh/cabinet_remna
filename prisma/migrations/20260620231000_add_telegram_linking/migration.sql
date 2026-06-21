-- AlterTable
ALTER TABLE "User" ADD COLUMN "telegramId" BIGINT,
ADD COLUMN "telegramUsername" TEXT,
ADD COLUMN "telegramLinkedAt" TIMESTAMP(3),
ADD COLUMN "remnashopUserId" INTEGER,
ADD COLUMN "remnashopSyncedAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "User_telegramId_key" ON "User"("telegramId");

-- CreateIndex
CREATE UNIQUE INDEX "User_remnashopUserId_key" ON "User"("remnashopUserId");
