CREATE INDEX "Subscription_userId_status_expireAt_idx" ON "Subscription"("userId", "status", "expireAt");

CREATE INDEX "Subscription_pendingSync_updatedAt_idx" ON "Subscription"("pendingSync", "updatedAt");

CREATE INDEX "Payment_userId_status_createdAt_idx" ON "Payment"("userId", "status", "createdAt");

CREATE INDEX "Payment_status_createdAt_idx" ON "Payment"("status", "createdAt");

CREATE INDEX "Payment_status_subscriptionProvisionedAt_createdAt_idx" ON "Payment"("status", "subscriptionProvisionedAt", "createdAt");

CREATE INDEX "SupportTicket_userId_lastMessageAt_idx" ON "SupportTicket"("userId", "lastMessageAt");

CREATE INDEX "SupportTicket_adminUnreadCount_lastMessageAt_idx" ON "SupportTicket"("adminUnreadCount", "lastMessageAt");
