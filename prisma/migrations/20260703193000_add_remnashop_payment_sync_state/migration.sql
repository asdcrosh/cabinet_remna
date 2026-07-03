ALTER TABLE "Payment"
  ADD COLUMN "remnashopSyncedAt" TIMESTAMP(3),
  ADD COLUMN "remnashopSyncError" TEXT;

CREATE INDEX "Payment_status_subscriptionProvisionedAt_remnashopSyncedAt_updatedAt_idx"
  ON "Payment"("status", "subscriptionProvisionedAt", "remnashopSyncedAt", "updatedAt");
