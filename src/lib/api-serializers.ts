import type { Payment, Plan, ProvisioningJob, Subscription } from '@prisma/client'

type SubscriptionWithPlan = Subscription & { plan?: Plan | null }
type PaymentWithRelations = Payment & {
  plan?: Plan | null
  subscription?: SubscriptionWithPlan | null
  provisioningJob?: ProvisioningJob | null
}

export function serializeSubscription(subscription: SubscriptionWithPlan | null | undefined) {
  if (!subscription) return null
  const {
    whitelistAddonInternalSquads: _internalSquads,
    planManagedByCabinet: _planManagedByCabinet,
    ...publicSubscription
  } = subscription

  return {
    ...publicSubscription,
    trafficLimitBytes: subscription.trafficLimitBytes?.toString() ?? null,
    trafficUsedBytes: subscription.trafficUsedBytes.toString(),
    lifetimeUsedBytes: subscription.lifetimeUsedBytes.toString(),
    whitelistAddonRemainingSeconds: subscription.whitelistAddonRemainingSeconds?.toString() ?? null,
    plan: subscription.plan ?? null,
  }
}

export function serializePayment(payment: PaymentWithRelations) {
  const { checkoutKey: _checkoutKey, ...serializablePayment } = payment
  return {
    ...serializablePayment,
    subscription: serializeSubscription(payment.subscription),
    plan: payment.plan ?? null,
    provisioningJob: payment.provisioningJob ?? null,
  }
}
