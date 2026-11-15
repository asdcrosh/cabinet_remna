-- Сообщение-счёт Stars в боте: удаляем его после успешной оплаты,
-- чтобы чат оставался в режиме единого окна.
ALTER TABLE "Payment" ADD COLUMN "botInvoiceMessageId" INTEGER;
