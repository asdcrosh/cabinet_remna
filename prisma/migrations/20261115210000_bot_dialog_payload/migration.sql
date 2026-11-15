-- Черновик ввода в диалоге бота (например, текст рассылки на шаге превью)
ALTER TABLE "TelegramBotDialog" ADD COLUMN "payload" TEXT;
