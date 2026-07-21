import { isPayAnyWayConfigured } from './payanyway'
import { isPlategaConfigured } from './platega'
import { isYookassaConfigured } from './yookassa'

export const CHECKOUT_PAYMENT_PROVIDERS = ['YOOKASSA', 'PAYANYWAY', 'PLATEGA'] as const
export type CheckoutPaymentProvider = typeof CHECKOUT_PAYMENT_PROVIDERS[number]

export async function getAvailablePaymentProviders(): Promise<Array<{
  id: CheckoutPaymentProvider
  label: string
}>> {
  const [yookassaConfigured, payAnyWayConfigured, plategaConfigured] = await Promise.all([
    isYookassaConfigured(),
    isPayAnyWayConfigured(),
    isPlategaConfigured(),
  ])
  return [
    ...(yookassaConfigured ? [{ id: 'YOOKASSA' as const, label: 'ЮKassa' }] : []),
    ...(payAnyWayConfigured ? [{ id: 'PAYANYWAY' as const, label: 'PayAnyWay' }] : []),
    ...(plategaConfigured ? [{ id: 'PLATEGA' as const, label: 'Platega' }] : []),
  ]
}

export async function isPaymentProviderAvailable(provider: CheckoutPaymentProvider) {
  if (provider === 'YOOKASSA') return isYookassaConfigured()
  if (provider === 'PAYANYWAY') return isPayAnyWayConfigured()
  return isPlategaConfigured()
}
