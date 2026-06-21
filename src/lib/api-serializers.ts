import type { Payment, Plan, ProvisioningJob, Subscription } from '@prisma/client'

type SubscriptionWithPlan = Subscription & { plan?: Plan | null }
type PaymentWithRelations = Payment & {
  plan?: Plan | null
  subscription?: SubscriptionWithPlan | null
  provisioningJob?: ProvisioningJob | null
}

export function serializeSubscription(subscription: SubscriptionWithPlan | null | undefined) {
  if (!subscription) return null

  return {
    ...subscription,
    trafficLimitBytes: subscription.trafficLimitBytes?.toString() ?? null,
    trafficUsedBytes: subscription.trafficUsedBytes.toString(),
    lifetimeUsedBytes: subscription.lifetimeUsedBytes.toString(),
    plan: subscription.plan ?? null,
  }
}

export function serializePayment(payment: PaymentWithRelations) {
  return {
    ...payment,
    subscription: serializeSubscription(payment.subscription),
    plan: payment.plan ?? null,
    provisioningJob: payment.provisioningJob ?? null,
  }
}
