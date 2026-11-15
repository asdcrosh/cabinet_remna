-- Якорь экрана очереди обращений администратора в боте
ALTER TABLE "User" ADD COLUMN "adminQueueBotMessageId" INTEGER;
