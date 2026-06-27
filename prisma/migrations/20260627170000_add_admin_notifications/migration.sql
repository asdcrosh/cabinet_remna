CREATE TABLE "AdminNotification" (
  "id" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "severity" TEXT NOT NULL DEFAULT 'INFO',
  "dedupeKey" TEXT,
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "entityType" TEXT,
  "entityId" TEXT,
  "actionHref" TEXT,
  "actionLabel" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AdminNotification_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AdminNotificationRead" (
  "id" TEXT NOT NULL,
  "notificationId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AdminNotificationRead_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AdminNotification_dedupeKey_key" ON "AdminNotification"("dedupeKey");
CREATE INDEX "AdminNotification_type_createdAt_idx" ON "AdminNotification"("type", "createdAt");
CREATE INDEX "AdminNotification_severity_createdAt_idx" ON "AdminNotification"("severity", "createdAt");
CREATE INDEX "AdminNotification_createdAt_idx" ON "AdminNotification"("createdAt");

CREATE UNIQUE INDEX "AdminNotificationRead_notificationId_userId_key" ON "AdminNotificationRead"("notificationId", "userId");
CREATE INDEX "AdminNotificationRead_userId_readAt_idx" ON "AdminNotificationRead"("userId", "readAt");

ALTER TABLE "AdminNotificationRead"
  ADD CONSTRAINT "AdminNotificationRead_notificationId_fkey"
  FOREIGN KEY ("notificationId") REFERENCES "AdminNotification"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AdminNotificationRead"
  ADD CONSTRAINT "AdminNotificationRead_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
