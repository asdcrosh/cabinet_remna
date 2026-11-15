-- Оценка ответа поддержки пользователем после закрытия обращения
ALTER TABLE "SupportTicket" ADD COLUMN "satisfactionRating" INTEGER;
ALTER TABLE "SupportTicket" ADD COLUMN "ratedAt" TIMESTAMP(3);
