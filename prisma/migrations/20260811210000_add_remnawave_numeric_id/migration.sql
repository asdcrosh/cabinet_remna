ALTER TABLE "User" ADD COLUMN "remnawaveId" INTEGER;

CREATE UNIQUE INDEX "User_remnawaveId_key" ON "User"("remnawaveId");
