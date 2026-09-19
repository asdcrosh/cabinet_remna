ALTER TABLE "SupportMessage" ADD COLUMN "clientMessageId" TEXT;

CREATE UNIQUE INDEX "SupportMessage_ticketId_clientMessageId_key"
ON "SupportMessage"("ticketId", "clientMessageId");
