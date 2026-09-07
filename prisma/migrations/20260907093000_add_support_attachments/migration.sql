CREATE TABLE "SupportAttachment" (
  "id" TEXT NOT NULL,
  "messageId" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "data" BYTEA NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SupportAttachment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SupportAttachment_messageId_createdAt_idx"
ON "SupportAttachment"("messageId", "createdAt");

ALTER TABLE "SupportAttachment"
ADD CONSTRAINT "SupportAttachment_messageId_fkey"
FOREIGN KEY ("messageId") REFERENCES "SupportMessage"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
