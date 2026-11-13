ALTER TYPE "PaymentProvider" ADD VALUE 'TELEGRAM_STARS';

ALTER TABLE "Payment"
  ADD COLUMN "starsAmount" INTEGER,
  ADD COLUMN "starsRateKopecks" INTEGER;
