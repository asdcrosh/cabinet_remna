-- CreateEnum
CREATE TYPE "WatchHealthStatus" AS ENUM ('HEALTHY', 'DEGRADED', 'DOWN', 'DISABLED', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "WatchProbeStatus" AS ENUM ('OK', 'FAIL', 'SKIPPED');

-- CreateEnum
CREATE TYPE "WatchIncidentStatus" AS ENUM ('OPEN', 'RESOLVED');

-- CreateEnum
CREATE TYPE "WatchIncidentType" AS ENUM ('PANEL_API', 'NODE_API', 'XHTTP', 'REALITY_TCP');

-- CreateTable
CREATE TABLE "WatchRuntimeState" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "status" "WatchHealthStatus" NOT NULL DEFAULT 'UNKNOWN',
    "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
    "consecutiveSuccesses" INTEGER NOT NULL DEFAULT 0,
    "lastRunAt" TIMESTAMP(3),
    "lastSuccessAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "WatchRuntimeState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WatchNodeState" (
    "nodeUuid" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "countryCode" TEXT,
    "isConnected" BOOLEAN NOT NULL DEFAULT false,
    "isDisabled" BOOLEAN NOT NULL DEFAULT false,
    "status" "WatchHealthStatus" NOT NULL DEFAULT 'UNKNOWN',
    "apiStatus" "WatchProbeStatus" NOT NULL DEFAULT 'SKIPPED',
    "xhttpStatus" "WatchProbeStatus" NOT NULL DEFAULT 'SKIPPED',
    "tcpStatus" "WatchProbeStatus" NOT NULL DEFAULT 'SKIPPED',
    "xhttpLatencyMs" INTEGER,
    "tcpLatencyMs" INTEGER,
    "usersOnline" INTEGER NOT NULL DEFAULT 0,
    "xrayUptimeSeconds" BIGINT,
    "loadOne" DOUBLE PRECISION,
    "memoryUsedBytes" BIGINT,
    "memoryTotalBytes" BIGINT,
    "rxBytesPerSecond" DOUBLE PRECISION,
    "txBytesPerSecond" DOUBLE PRECISION,
    "xrayVersion" TEXT,
    "nodeVersion" TEXT,
    "apiConsecutiveFailures" INTEGER NOT NULL DEFAULT 0,
    "apiConsecutiveSuccesses" INTEGER NOT NULL DEFAULT 0,
    "xhttpConsecutiveFailures" INTEGER NOT NULL DEFAULT 0,
    "xhttpConsecutiveSuccesses" INTEGER NOT NULL DEFAULT 0,
    "tcpConsecutiveFailures" INTEGER NOT NULL DEFAULT 0,
    "tcpConsecutiveSuccesses" INTEGER NOT NULL DEFAULT 0,
    "lastCheckedAt" TIMESTAMP(3),
    "lastHealthyAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "WatchNodeState_pkey" PRIMARY KEY ("nodeUuid")
);

-- CreateTable
CREATE TABLE "WatchProbe" (
    "id" TEXT NOT NULL,
    "nodeUuid" TEXT NOT NULL,
    "status" "WatchHealthStatus" NOT NULL,
    "apiStatus" "WatchProbeStatus" NOT NULL,
    "xhttpStatus" "WatchProbeStatus" NOT NULL,
    "tcpStatus" "WatchProbeStatus" NOT NULL,
    "xhttpLatencyMs" INTEGER,
    "tcpLatencyMs" INTEGER,
    "isConnected" BOOLEAN NOT NULL,
    "isDisabled" BOOLEAN NOT NULL,
    "usersOnline" INTEGER NOT NULL DEFAULT 0,
    "loadOne" DOUBLE PRECISION,
    "memoryUsedBytes" BIGINT,
    "memoryTotalBytes" BIGINT,
    "rxBytesPerSecond" DOUBLE PRECISION,
    "txBytesPerSecond" DOUBLE PRECISION,
    "error" TEXT,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WatchProbe_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WatchIncident" (
    "id" TEXT NOT NULL,
    "nodeUuid" TEXT,
    "nodeName" TEXT,
    "type" "WatchIncidentType" NOT NULL,
    "status" "WatchIncidentStatus" NOT NULL DEFAULT 'OPEN',
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "occurrences" INTEGER NOT NULL DEFAULT 1,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastObservedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "WatchIncident_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WatchNodeState_status_name_idx" ON "WatchNodeState"("status", "name");
CREATE INDEX "WatchNodeState_lastCheckedAt_idx" ON "WatchNodeState"("lastCheckedAt");
CREATE INDEX "WatchProbe_nodeUuid_checkedAt_idx" ON "WatchProbe"("nodeUuid", "checkedAt");
CREATE INDEX "WatchProbe_status_checkedAt_idx" ON "WatchProbe"("status", "checkedAt");
CREATE INDEX "WatchProbe_checkedAt_idx" ON "WatchProbe"("checkedAt");
CREATE INDEX "WatchIncident_status_openedAt_idx" ON "WatchIncident"("status", "openedAt");
CREATE INDEX "WatchIncident_nodeUuid_type_status_idx" ON "WatchIncident"("nodeUuid", "type", "status");
CREATE INDEX "WatchIncident_resolvedAt_idx" ON "WatchIncident"("resolvedAt");

-- AddForeignKey
ALTER TABLE "WatchProbe" ADD CONSTRAINT "WatchProbe_nodeUuid_fkey" FOREIGN KEY ("nodeUuid") REFERENCES "WatchNodeState"("nodeUuid") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WatchIncident" ADD CONSTRAINT "WatchIncident_nodeUuid_fkey" FOREIGN KEY ("nodeUuid") REFERENCES "WatchNodeState"("nodeUuid") ON DELETE SET NULL ON UPDATE CASCADE;
