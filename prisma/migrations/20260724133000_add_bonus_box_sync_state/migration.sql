ALTER TABLE "BonusBoxOpening"
ADD COLUMN "remoteSynced" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "syncAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "lastSyncError" TEXT,
ADD COLUMN "nextSyncAt" TIMESTAMP(3);

CREATE INDEX "BonusBoxOpening_userId_remoteSynced_nextSyncAt_idx"
ON "BonusBoxOpening"("userId", "remoteSynced", "nextSyncAt");
