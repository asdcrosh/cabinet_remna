-- Персональный промокод пригласившему за вступившего друга
ALTER TABLE "TelegramChannelReferral" ADD COLUMN "referrerPromoCodeId" TEXT;

CREATE UNIQUE INDEX "TelegramChannelReferral_referrerPromoCodeId_key" ON "TelegramChannelReferral"("referrerPromoCodeId");
