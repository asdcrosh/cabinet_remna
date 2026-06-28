-- CreateTable
CREATE TABLE "BroadcastTemplate" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "segment" TEXT NOT NULL,
    "channels" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "actionHref" TEXT,
    "actionLabel" TEXT,
    "imageUrl" TEXT,
    "body" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BroadcastTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BroadcastTemplate_createdAt_idx" ON "BroadcastTemplate"("createdAt");

-- CreateIndex
CREATE INDEX "BroadcastTemplate_createdById_createdAt_idx" ON "BroadcastTemplate"("createdById", "createdAt");

-- AddForeignKey
ALTER TABLE "BroadcastTemplate" ADD CONSTRAINT "BroadcastTemplate_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
