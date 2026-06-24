-- CreateEnum
CREATE TYPE "BonusBoxPrizeType" AS ENUM ('SUBSCRIPTION_DAYS', 'TRAFFIC_GB', 'PROMO_CODE_PERCENT');

-- CreateEnum
CREATE TYPE "BonusBoxRarity" AS ENUM ('COMMON', 'RARE', 'EPIC', 'LEGENDARY');

-- CreateEnum
CREATE TYPE "BonusBoxAttemptSource" AS ENUM ('PAYMENT', 'WEEKLY', 'REFERRAL', 'MANUAL');

-- CreateTable
CREATE TABLE "BonusBoxPrize" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "type" "BonusBoxPrizeType" NOT NULL,
    "value" INTEGER NOT NULL,
    "weight" INTEGER NOT NULL DEFAULT 1,
    "rarity" "BonusBoxRarity" NOT NULL DEFAULT 'COMMON',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "maxWins" INTEGER,
    "winsCount" INTEGER NOT NULL DEFAULT 0,
    "promoExpiresInDays" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BonusBoxPrize_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BonusBoxAttempt" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "source" "BonusBoxAttemptSource" NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BonusBoxAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BonusBoxOpening" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "prizeId" TEXT NOT NULL,
    "prizeSnapshot" JSONB NOT NULL,
    "awardedSubscriptionId" TEXT,
    "promoCodeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BonusBoxOpening_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BonusBoxPrize_isActive_weight_idx" ON "BonusBoxPrize"("isActive", "weight");

-- CreateIndex
CREATE INDEX "BonusBoxPrize_rarity_idx" ON "BonusBoxPrize"("rarity");

-- CreateIndex
CREATE UNIQUE INDEX "BonusBoxAttempt_userId_source_sourceKey_key" ON "BonusBoxAttempt"("userId", "source", "sourceKey");

-- CreateIndex
CREATE INDEX "BonusBoxAttempt_userId_usedAt_expiresAt_idx" ON "BonusBoxAttempt"("userId", "usedAt", "expiresAt");

-- CreateIndex
CREATE INDEX "BonusBoxAttempt_source_sourceKey_idx" ON "BonusBoxAttempt"("source", "sourceKey");

-- CreateIndex
CREATE UNIQUE INDEX "BonusBoxOpening_attemptId_key" ON "BonusBoxOpening"("attemptId");

-- CreateIndex
CREATE INDEX "BonusBoxOpening_userId_createdAt_idx" ON "BonusBoxOpening"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "BonusBoxOpening_prizeId_createdAt_idx" ON "BonusBoxOpening"("prizeId", "createdAt");

-- CreateIndex
CREATE INDEX "BonusBoxOpening_promoCodeId_idx" ON "BonusBoxOpening"("promoCodeId");

-- AddForeignKey
ALTER TABLE "BonusBoxAttempt" ADD CONSTRAINT "BonusBoxAttempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BonusBoxOpening" ADD CONSTRAINT "BonusBoxOpening_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BonusBoxOpening" ADD CONSTRAINT "BonusBoxOpening_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "BonusBoxAttempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BonusBoxOpening" ADD CONSTRAINT "BonusBoxOpening_prizeId_fkey" FOREIGN KEY ("prizeId") REFERENCES "BonusBoxPrize"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BonusBoxOpening" ADD CONSTRAINT "BonusBoxOpening_promoCodeId_fkey" FOREIGN KEY ("promoCodeId") REFERENCES "PromoCode"("id") ON DELETE SET NULL ON UPDATE CASCADE;
