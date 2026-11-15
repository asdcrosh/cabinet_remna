-- Якоря окна переписки поддержки в боте: тред обновляется в одном сообщении
ALTER TABLE "SupportTicket" ADD COLUMN "userBotMessageId" INTEGER;
ALTER TABLE "SupportTicket" ADD COLUMN "adminBotChatId" BIGINT;
ALTER TABLE "SupportTicket" ADD COLUMN "adminBotMessageId" INTEGER;
