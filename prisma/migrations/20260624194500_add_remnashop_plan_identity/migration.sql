ALTER TABLE "Plan"
ADD COLUMN "remnashopPlanId" INTEGER;

CREATE UNIQUE INDEX "Plan_remnashopPlanId_durationDays_key"
ON "Plan"("remnashopPlanId", "durationDays");
