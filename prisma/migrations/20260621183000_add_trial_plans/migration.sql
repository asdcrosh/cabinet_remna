ALTER TABLE "Plan" ADD COLUMN "isPromo" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "TrialPlanRedemption" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrialPlanRedemption_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TrialPlanRedemption_paymentId_key" ON "TrialPlanRedemption"("paymentId");
CREATE UNIQUE INDEX "TrialPlanRedemption_userId_planId_key" ON "TrialPlanRedemption"("userId", "planId");
CREATE INDEX "TrialPlanRedemption_planId_idx" ON "TrialPlanRedemption"("planId");

ALTER TABLE "TrialPlanRedemption" ADD CONSTRAINT "TrialPlanRedemption_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TrialPlanRedemption" ADD CONSTRAINT "TrialPlanRedemption_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TrialPlanRedemption" ADD CONSTRAINT "TrialPlanRedemption_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
