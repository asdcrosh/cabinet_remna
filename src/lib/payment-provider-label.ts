import type { PaymentProvider } from '@prisma/client'

export function paymentProviderLabel(provider: PaymentProvider) {
  const labels: Record<PaymentProvider, string> = {
    YOOKASSA: 'ЮKassa',
    PAYANYWAY: 'PayAnyWay',
    PLATEGA: 'Platega',
    TELEGRAM_STARS: 'Telegram Stars',
    LOCAL: 'Без оплаты',
  }
  return labels[provider]
}
