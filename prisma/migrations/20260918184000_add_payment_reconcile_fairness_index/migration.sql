CREATE INDEX "Payment_provider_status_updatedAt_idx"
ON "Payment"("provider", "status", "updatedAt");
