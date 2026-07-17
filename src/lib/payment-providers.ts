import { isPayAnyWayConfigured } from './payanyway'
import { isYookassaConfigured } from './yookassa'

export const CHECKOUT_PAYMENT_PROVIDERS = ['YOOKASSA', 'PAYANYWAY'] as const
export type CheckoutPaymentProvider = typeof CHECKOUT_PAYMENT_PROVIDERS[number]

export function getAvailablePaymentProviders(): Array<{
  id: CheckoutPaymentProvider
  label: string
}> {
  return [
    ...(isYookassaConfigured() ? [{ id: 'YOOKASSA' as const, label: 'ЮKassa' }] : []),
    ...(isPayAnyWayConfigured() ? [{ id: 'PAYANYWAY' as const, label: 'PayAnyWay' }] : []),
  ]
}

export function isPaymentProviderAvailable(provider: CheckoutPaymentProvider) {
  return provider === 'YOOKASSA' ? isYookassaConfigured() : isPayAnyWayConfigured()
}
