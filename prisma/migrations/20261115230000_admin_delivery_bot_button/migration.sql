-- Вторая кнопка в Telegram-доставке админу: «Открыть в боте» (deep link в миниапп-бота)
ALTER TABLE "AdminTelegramDelivery" ADD COLUMN "actionHref2" TEXT;
ALTER TABLE "AdminTelegramDelivery" ADD COLUMN "actionLabel2" TEXT;
