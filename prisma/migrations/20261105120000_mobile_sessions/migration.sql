-- Сессии входа из приложения StealthNet
ALTER TYPE "AuditAction" ADD VALUE 'MOBILE_SESSION_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'MOBILE_SESSION_REVOKED';
ALTER TYPE "AuditAction" ADD VALUE 'MOBILE_REFRESH_REUSE_DETECTED';

CREATE TABLE "MobileSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "hwid" TEXT NOT NULL,
    "deviceName" TEXT,
    "platform" TEXT,
    "appVersion" TEXT,
    "refreshHash" TEXT NOT NULL,
    "prevHash" TEXT,
    "sessionVersion" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "revokeReason" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,

    CONSTRAINT "MobileSession_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MobileSession_refreshHash_key" ON "MobileSession"("refreshHash");
CREATE UNIQUE INDEX "MobileSession_prevHash_key" ON "MobileSession"("prevHash");
CREATE INDEX "MobileSession_userId_revokedAt_idx" ON "MobileSession"("userId", "revokedAt");
CREATE INDEX "MobileSession_expiresAt_idx" ON "MobileSession"("expiresAt");

ALTER TABLE "MobileSession" ADD CONSTRAINT "MobileSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
