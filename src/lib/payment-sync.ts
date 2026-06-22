import { prisma } from './prisma'
import { provisionPaymentSubscription } from './provisioning'
import { cancelPayment, getPayment } from './yookassa'

export type PaymentSyncResult =
  | { ok: true; status: 'not_found' | 'missing_external_id' | 'pending' | 'canceled'; provisioned: false }
  | { ok: true; status: 'succeeded'; provisioned: true; alreadyProvisioned?: boolean; subscriptionId?: string }
  | { ok: false; status: 'check_failed' | 'provisioning_failed'; provisioned: false; error: string }

export async function syncPaymentProvisioning(input: {
  paymentId: string
  userId?: string
  cancelPendingOlderThanMs?: number
}): Promise<PaymentSyncResult> {
  const payment = await prisma.payment.findFirst({
    where: {
      id: input.paymentId,
      ...(input.userId ? { userId: input.userId } : {}),
    },
    include: { user: true, plan: true, subscription: true },
  })

  if (!payment) return { ok: true, status: 'not_found', provisioned: false }
  if (!payment.yookassaId) {
    if (payment.status !== 'SUCCEEDED') {
      return { ok: true, status: 'missing_external_id', provisioned: false }
    }
    if (payment.subscriptionProvisionedAt && payment.subscription) {
      return {
        ok: true,
        status: 'succeeded',
        provisioned: true,
        alreadyProvisioned: true,
        subscriptionId: payment.subscription.id,
      }
    }

    try {
      const result = await provisionPaymentSubscription({
        userId: payment.user.id,
        email: payment.user.email,
        paymentId: payment.id,
        plan: {
          id: payment.plan.id,
          name: payment.plan.name,
          durationDays: payment.plan.durationDays,
          trafficLimitGb: payment.plan.trafficLimitGb,
          deviceLimit: payment.plan.deviceLimit,
          activeInternalSquads: payment.plan.activeInternalSquads,
        },
      })

      return {
        ok: true,
        status: 'succeeded',
        provisioned: true,
        subscriptionId: result.subscription.id,
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : 'subscription provisioning failed'
      await prisma.payment.update({
        where: { id: payment.id },
        data: { provisioningError: message.slice(0, 1000) },
      })
      return { ok: false, status: 'provisioning_failed', provisioned: false, error: message }
    }
  }

  let yooPayment
  try {
    yooPayment = await getPayment(payment.yookassaId)
  } catch (e) {
    const message = e instanceof Error ? e.message : 'payment status check failed'
    await prisma.payment.update({
      where: { id: payment.id },
      data: { provisioningError: message.slice(0, 1000) },
    })
    return { ok: false, status: 'check_failed', provisioned: false, error: message }
  }

  if (yooPayment.status === 'canceled') {
    await prisma.$transaction([
      prisma.payment.update({
        where: { id: payment.id },
        data: { status: 'CANCELED', yookassaStatus: 'canceled' },
      }),
      prisma.promoCodeRedemption.updateMany({
        where: { paymentId: payment.id, status: 'PENDING' },
        data: { status: 'CANCELED' },
      }),
    ])

    return { ok: true, status: 'canceled', provisioned: false }
  }

  if (yooPayment.status !== 'succeeded') {
    if (
      input.cancelPendingOlderThanMs &&
      Date.now() - payment.createdAt.getTime() >= input.cancelPendingOlderThanMs
    ) {
      try {
        const canceledPayment = await cancelPayment(payment.yookassaId, `cancel-${payment.id}`)
        if (canceledPayment.status === 'canceled') {
          await cancelLocalPayment(payment.id, 'canceled')
          return { ok: true, status: 'canceled', provisioned: false }
        }
      } catch (e) {
        const message = e instanceof Error ? e.message : 'payment cancellation failed'
        await prisma.payment.update({
          where: { id: payment.id },
          data: {
            yookassaStatus: yooPayment.status,
            provisioningError: message.slice(0, 1000),
          },
        })
        return { ok: false, status: 'check_failed', provisioned: false, error: message }
      }
    }

    await prisma.payment.update({
      where: { id: payment.id },
      data: { yookassaStatus: yooPayment.status },
    })

    return { ok: true, status: 'pending', provisioned: false }
  }

  await prisma.$transaction([
    prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: 'SUCCEEDED',
        yookassaStatus: 'succeeded',
        paidAt: payment.paidAt ?? new Date(),
      },
    }),
    prisma.promoCodeRedemption.updateMany({
      where: { paymentId: payment.id, status: 'PENDING' },
      data: { status: 'SUCCEEDED' },
    }),
  ])

  if (payment.subscriptionProvisionedAt && payment.subscription) {
    return {
      ok: true,
      status: 'succeeded',
      provisioned: true,
      alreadyProvisioned: true,
      subscriptionId: payment.subscription.id,
    }
  }

  try {
    const result = await provisionPaymentSubscription({
      userId: payment.user.id,
      email: payment.user.email,
      paymentId: payment.id,
      plan: {
        id: payment.plan.id,
        name: payment.plan.name,
        durationDays: payment.plan.durationDays,
        trafficLimitGb: payment.plan.trafficLimitGb,
        deviceLimit: payment.plan.deviceLimit,
        activeInternalSquads: payment.plan.activeInternalSquads,
      },
    })

    return {
      ok: true,
      status: 'succeeded',
      provisioned: true,
      subscriptionId: result.subscription.id,
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : 'subscription provisioning failed'
    await prisma.payment.update({
      where: { id: payment.id },
      data: { provisioningError: message.slice(0, 1000) },
    })
    return { ok: false, status: 'provisioning_failed', provisioned: false, error: message }
  }
}

async function cancelLocalPayment(paymentId: string, yookassaStatus: string | null) {
  await prisma.$transaction([
    prisma.payment.update({
      where: { id: paymentId },
      data: {
        status: 'CANCELED',
        yookassaStatus,
      },
    }),
    prisma.promoCodeRedemption.updateMany({
      where: { paymentId, status: 'PENDING' },
      data: { status: 'CANCELED' },
    }),
  ])
}
