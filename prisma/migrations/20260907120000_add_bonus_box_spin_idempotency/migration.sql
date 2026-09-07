ALTER TABLE "BonusBoxOpening"
ADD COLUMN "spinId" TEXT,
ADD COLUMN "reelSnapshot" JSONB,
ADD COLUMN "winningIndex" INTEGER,
ADD COLUMN "stopOffsetRatio" DOUBLE PRECISION;

CREATE UNIQUE INDEX "BonusBoxOpening_userId_spinId_key"
ON "BonusBoxOpening"("userId", "spinId");
