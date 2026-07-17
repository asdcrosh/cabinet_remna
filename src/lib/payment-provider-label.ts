import type { PaymentProvider } from '@prisma/client'

export function paymentProviderLabel(provider: PaymentProvider) {
  const labels: Record<PaymentProvider, string> = {
    YOOKASSA: 'ЮKassa',
    PAYANYWAY: 'PayAnyWay',
    LOCAL: 'Без оплаты',
  }
  return labels[provider]
}
