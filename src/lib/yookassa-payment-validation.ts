import type { YooPayment } from './yookassa'

type LocalYooKassaPayment = {
  id: string
  userId: string
  planId: string
  amountKopecks: number
}

export class YooKassaPaymentMismatchError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'YooKassaPaymentMismatchError'
  }
}

export function validateYooKassaPayment(
  local: LocalYooKassaPayment,
  remote: YooPayment,
  expectedExternalId: string
) {
  if (remote.id !== expectedExternalId) {
    throw new YooKassaPaymentMismatchError('YooKassa returned a different payment id')
  }
  if (remote.amount.currency.toUpperCase() !== 'RUB') {
    throw new YooKassaPaymentMismatchError('YooKassa returned a different currency')
  }
  if (moneyToKopecks(remote.amount.value) !== local.amountKopecks) {
    throw new YooKassaPaymentMismatchError('YooKassa returned a different amount')
  }
  if (remote.metadata?.localPaymentId && remote.metadata.localPaymentId !== local.id) {
    throw new YooKassaPaymentMismatchError('YooKassa metadata references a different payment')
  }
  if (remote.metadata?.userId && remote.metadata.userId !== local.userId) {
    throw new YooKassaPaymentMismatchError('YooKassa metadata references a different user')
  }
  if (remote.metadata?.planId && remote.metadata.planId !== local.planId) {
    throw new YooKassaPaymentMismatchError('YooKassa metadata references a different plan')
  }
  if (remote.status === 'succeeded' && remote.paid !== true) {
    throw new YooKassaPaymentMismatchError('YooKassa succeeded payment is not marked paid')
  }
}

function moneyToKopecks(value: string) {
  if (!/^\d+(?:\.\d{1,2})?$/.test(value)) {
    throw new YooKassaPaymentMismatchError('YooKassa returned an invalid amount')
  }
  const [rubles, kopecks = ''] = value.split('.')
  const result = Number(rubles) * 100 + Number(kopecks.padEnd(2, '0'))
  if (!Number.isSafeInteger(result)) {
    throw new YooKassaPaymentMismatchError('YooKassa returned an invalid amount')
  }
  return result
}
