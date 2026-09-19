import type { PaymentPurchaseType } from '@prisma/client'
import { revokeDeviceLimitAddonForPayment } from './device-limit-addon'
import { recordSucceededRefund } from './payment-refunds'
import { terminateUserSubscription } from './subscription-termination'

interface ApplyPlategaChargebackInput {
  paymentId: string
  userId: string
  purchaseType: PaymentPurchaseType
  amountKopecks: number
  externalPaymentId: string
}

export async function applyPlategaChargeback(input: ApplyPlategaChargebackInput) {
  await recordSucceededRefund({
    paymentId: input.paymentId,
    providerRefundId: `platega-chargeback:${input.externalPaymentId}`,
    amountKopecks: input.amountKopecks,
    paymentAmountKopecks: input.amountKopecks,
    providerStatus: 'CHARGEBACKED',
  })

  if (input.purchaseType === 'WHITELIST_ADDON') {
    return { accessRevoked: true }
  }
  if (input.purchaseType === 'DEVICE_LIMIT_ADDON') {
    const result = await revokeDeviceLimitAddonForPayment(input.paymentId)
    return { accessRevoked: result.revoked }
  }

  await terminateUserSubscription({
    userId: input.userId,
    source: 'PLATEGA_CHARGEBACK',
    paymentId: input.paymentId,
  })
  return { accessRevoked: true }
}
