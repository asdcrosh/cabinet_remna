CREATE TYPE "SyncDirection" AS ENUM ('CABINET_TO_REMNASHOP', 'REMNASHOP_TO_CABINET');

CREATE TYPE "SyncEventStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED', 'SKIPPED');

CREATE TABLE "SyncEvent" (
    "id" TEXT NOT NULL,
    "direction" "SyncDirection" NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "status" "SyncEventStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "nextRetryAt" TIMESTAMP(3),
    "lastSyncedAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SyncEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SyncEvent_direction_entityType_entityId_operation_key"
    ON "SyncEvent"("direction", "entityType", "entityId", "operation");

CREATE INDEX "SyncEvent_status_nextRetryAt_updatedAt_idx"
    ON "SyncEvent"("status", "nextRetryAt", "updatedAt");

CREATE INDEX "SyncEvent_direction_entityType_status_idx"
    ON "SyncEvent"("direction", "entityType", "status");

CREATE INDEX "SyncEvent_updatedAt_idx" ON "SyncEvent"("updatedAt");
