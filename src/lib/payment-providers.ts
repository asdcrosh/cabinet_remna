import { isPayAnyWayConfigured } from './payanyway'
import { isYookassaConfigured } from './yookassa'

export const CHECKOUT_PAYMENT_PROVIDERS = ['YOOKASSA', 'PAYANYWAY'] as const
export type CheckoutPaymentProvider = typeof CHECKOUT_PAYMENT_PROVIDERS[number]

export async function getAvailablePaymentProviders(): Promise<Array<{
  id: CheckoutPaymentProvider
  label: string
}>> {
  const [yookassaConfigured, payAnyWayConfigured] = await Promise.all([
    isYookassaConfigured(),
    isPayAnyWayConfigured(),
  ])
  return [
    ...(yookassaConfigured ? [{ id: 'YOOKASSA' as const, label: 'ЮKassa' }] : []),
    ...(payAnyWayConfigured ? [{ id: 'PAYANYWAY' as const, label: 'PayAnyWay' }] : []),
  ]
}

export async function isPaymentProviderAvailable(provider: CheckoutPaymentProvider) {
  return provider === 'YOOKASSA' ? isYookassaConfigured() : isPayAnyWayConfigured()
}
