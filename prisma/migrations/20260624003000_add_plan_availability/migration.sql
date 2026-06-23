CREATE TYPE "PlanAvailability" AS ENUM ('ALL', 'NEW', 'EXISTING', 'INVITED', 'ALLOWED', 'LINK');

ALTER TABLE "Plan"
ADD COLUMN "availability" "PlanAvailability" NOT NULL DEFAULT 'ALL',
ADD COLUMN "allowedEmails" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "allowedTelegramIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

CREATE INDEX "Plan_availability_isActive_sortOrder_idx"
ON "Plan"("availability", "isActive", "sortOrder");
