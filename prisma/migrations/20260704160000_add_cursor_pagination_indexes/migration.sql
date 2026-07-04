CREATE INDEX "User_createdAt_id_idx" ON "User"("createdAt", "id");
CREATE INDEX "Payment_createdAt_id_idx" ON "Payment"("createdAt", "id");
CREATE INDEX "SupportTicket_adminUnreadCount_lastMessageAt_id_idx" ON "SupportTicket"("adminUnreadCount", "lastMessageAt", "id");
