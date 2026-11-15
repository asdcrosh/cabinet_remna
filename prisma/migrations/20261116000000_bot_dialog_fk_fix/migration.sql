-- Устраняет дрейф TelegramBotDialog: в схеме @updatedAt без DEFAULT в БД
-- и объявлена связь с User, которой не хватало в первой миграции таблицы.
ALTER TABLE "TelegramBotDialog" ALTER COLUMN "updatedAt" DROP DEFAULT;
ALTER TABLE "TelegramBotDialog" ADD CONSTRAINT "TelegramBotDialog_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
