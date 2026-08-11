CREATE TYPE "NodeProvisioningStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED');
CREATE TYPE "NodeProvisioningStep" AS ENUM ('QUEUED', 'DNS', 'SSH_PREFLIGHT', 'REMNAWAVE_NODE', 'ANSIBLE', 'NODE_CONNECT', 'HOSTS', 'VERIFY', 'DONE');
CREATE TYPE "NodeProvisioningEventLevel" AS ENUM ('INFO', 'SUCCESS', 'WARNING', 'ERROR');

ALTER TYPE "AuditAction" ADD VALUE 'ADMIN_NODE_PROVISIONING_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'ADMIN_NODE_PROVISIONING_RETRIED';

CREATE TABLE "NodeProvisioningJob" (
    "id" TEXT NOT NULL,
    "status" "NodeProvisioningStatus" NOT NULL DEFAULT 'PENDING',
    "step" "NodeProvisioningStep" NOT NULL DEFAULT 'QUEUED',
    "activeKey" TEXT,
    "nodeName" TEXT NOT NULL,
    "fqdn" TEXT NOT NULL,
    "serverIp" TEXT NOT NULL,
    "sshPort" INTEGER NOT NULL DEFAULT 22,
    "sshUser" TEXT NOT NULL,
    "encryptedSshPassword" TEXT NOT NULL,
    "credentialsExpireAt" TIMESTAMP(3) NOT NULL,
    "sshHostKeyFingerprint" TEXT,
    "tcpTemplateHostUuid" TEXT NOT NULL,
    "xhttpTemplateHostUuid" TEXT NOT NULL,
    "remnawaveNodeUuid" TEXT,
    "tcpHostUuid" TEXT,
    "xhttpHostUuid" TEXT,
    "dnsRecordId" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lockedAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "NodeProvisioningJob_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "NodeProvisioningEvent" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "step" "NodeProvisioningStep" NOT NULL,
    "level" "NodeProvisioningEventLevel" NOT NULL DEFAULT 'INFO',
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NodeProvisioningEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "NodeProvisioningJob_activeKey_key" ON "NodeProvisioningJob"("activeKey");
CREATE UNIQUE INDEX "NodeProvisioningJob_active_fqdn_key"
  ON "NodeProvisioningJob"("fqdn")
  WHERE "status" IN ('PENDING', 'RUNNING');
CREATE UNIQUE INDEX "NodeProvisioningJob_active_serverIp_key"
  ON "NodeProvisioningJob"("serverIp")
  WHERE "status" IN ('PENDING', 'RUNNING');
CREATE INDEX "NodeProvisioningJob_status_createdAt_idx" ON "NodeProvisioningJob"("status", "createdAt");
CREATE INDEX "NodeProvisioningJob_lockedAt_idx" ON "NodeProvisioningJob"("lockedAt");
CREATE INDEX "NodeProvisioningJob_createdById_createdAt_idx" ON "NodeProvisioningJob"("createdById", "createdAt");
CREATE INDEX "NodeProvisioningJob_fqdn_createdAt_idx" ON "NodeProvisioningJob"("fqdn", "createdAt");
CREATE INDEX "NodeProvisioningJob_serverIp_createdAt_idx" ON "NodeProvisioningJob"("serverIp", "createdAt");
CREATE INDEX "NodeProvisioningEvent_jobId_createdAt_idx" ON "NodeProvisioningEvent"("jobId", "createdAt");

ALTER TABLE "NodeProvisioningJob"
  ADD CONSTRAINT "NodeProvisioningJob_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "NodeProvisioningEvent"
  ADD CONSTRAINT "NodeProvisioningEvent_jobId_fkey"
  FOREIGN KEY ("jobId") REFERENCES "NodeProvisioningJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;
