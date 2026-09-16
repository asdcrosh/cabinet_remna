ALTER TABLE "SupportTicket"
  ADD COLUMN "assigneeId" TEXT,
  ADD COLUMN "assignedAt" TIMESTAMP(3);

CREATE TABLE "SupportInternalNote" (
  "id" TEXT NOT NULL,
  "ticketId" TEXT NOT NULL,
  "authorId" TEXT,
  "body" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "SupportInternalNote_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SupportTicket_assigneeId_status_lastMessageAt_idx"
  ON "SupportTicket"("assigneeId", "status", "lastMessageAt");

CREATE INDEX "SupportInternalNote_ticketId_createdAt_idx"
  ON "SupportInternalNote"("ticketId", "createdAt");

CREATE INDEX "SupportInternalNote_authorId_idx"
  ON "SupportInternalNote"("authorId");

ALTER TABLE "SupportTicket"
  ADD CONSTRAINT "SupportTicket_assigneeId_fkey"
  FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SupportInternalNote"
  ADD CONSTRAINT "SupportInternalNote_ticketId_fkey"
  FOREIGN KEY ("ticketId") REFERENCES "SupportTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SupportInternalNote"
  ADD CONSTRAINT "SupportInternalNote_authorId_fkey"
  FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
