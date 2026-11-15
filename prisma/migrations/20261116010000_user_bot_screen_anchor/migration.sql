-- Якорь единого окна бота: навигация правит последнее экранное сообщение на месте
ALTER TABLE "User" ADD COLUMN "botScreenMessageId" INTEGER;
