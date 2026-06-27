CREATE TABLE "UserNotification" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "type" "NotificationType" NOT NULL,
  "dedupeKey" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "actionHref" TEXT,
  "actionLabel" TEXT,
  "readAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UserNotification_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserNotification_userId_dedupeKey_key" ON "UserNotification"("userId", "dedupeKey");
CREATE INDEX "UserNotification_userId_readAt_createdAt_idx" ON "UserNotification"("userId", "readAt", "createdAt");
CREATE INDEX "UserNotification_userId_type_createdAt_idx" ON "UserNotification"("userId", "type", "createdAt");

ALTER TABLE "UserNotification"
  ADD CONSTRAINT "UserNotification_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
