import { prisma } from './prisma'
import { notifyPaymentCanceled, notifyPaymentStuck } from './notifications'
import { provisionPaymentSubscription } from './provisioning'
import { cancelPayment, getPayment } from './yookassa'

const DEFAULT_PENDING_TTL_SECONDS = 600

export type PaymentSyncResult =
  | { ok: true; status: 'not_found' | 'missing_external_id' | 'pending' | 'canceled'; provisioned: false }
  | { ok: true; status: 'succeeded'; provisioned: true; alreadyProvisioned?: boolean; subscriptionId?: string }
  | { ok: false; status: 'check_failed' | 'provisioning_failed'; provisioned: false; error: string }

type PendingPaymentForCancel = {
  id: string
  userId: string
  yookassaId: string | null
}

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
  if (payment.status === 'CANCELED') {
    return { ok: true, status: 'canceled', provisioned: false }
  }
  if (!payment.yookassaId) {
    if (payment.status !== 'SUCCEEDED') {
      if (
        input.cancelPendingOlderThanMs &&
        Date.now() - payment.createdAt.getTime() >= input.cancelPendingOlderThanMs
      ) {
        await cancelLocalPayment(payment.id, null)
        await notifyPaymentCanceled(payment.id, 'Платёж отменён, потому что ссылка на оплату устарела.')
        return { ok: true, status: 'canceled', provisioned: false }
      }
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
      await notifyPaymentStuck(payment.id, 'Платёж прошёл, но подписка пока не выдана автоматически.')
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
    await notifyPaymentCanceled(payment.id)

    return { ok: true, status: 'canceled', provisioned: false }
  }

  if (yooPayment.status !== 'succeeded') {
    if (
      input.cancelPendingOlderThanMs &&
      Date.now() - payment.createdAt.getTime() >= input.cancelPendingOlderThanMs
    ) {
      const canceled = await cancelPendingPayment(
        payment,
        'Платёж отменён, потому что слишком долго ожидал подтверждения.'
      )
      if (canceled === 'canceled') return { ok: true, status: 'canceled', provisioned: false }
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
  await cancelOtherPendingPaymentsForUser(payment.userId, payment.id)

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
    await notifyPaymentStuck(payment.id, 'Платёж прошёл, но подписка пока не выдана автоматически.')
    return { ok: false, status: 'provisioning_failed', provisioned: false, error: message }
  }
}

export async function cancelOtherPendingPaymentsForUser(userId: string, paidPaymentId: string, limit = 25) {
  const payments = await prisma.payment.findMany({
    where: {
      userId,
      status: 'PENDING',
      id: { not: paidPaymentId },
    },
    orderBy: { createdAt: 'asc' },
    take: limit,
    select: { id: true, userId: true, yookassaId: true },
  })

  let canceled = 0
  let paid = 0

  for (const payment of payments) {
    const result = await cancelPendingPayment(payment, 'Платёж отменён, потому что другая оплата уже завершена.').catch(
      (error) => {
        console.error('[payment-sync] sibling pending cancellation failed', {
          paymentId: payment.id,
          userId,
          message: error instanceof Error ? error.message : 'unknown error',
        })
        return null
      }
    )

    if (result === 'paid') {
      paid += 1
      await syncPaymentProvisioning({ paymentId: payment.id, userId }).catch((error) => {
        console.error('[payment-sync] sibling paid payment provisioning failed', {
          paymentId: payment.id,
          userId,
          message: error instanceof Error ? error.message : 'unknown error',
        })
      })
    } else if (result === 'canceled') {
      canceled += 1
    }
  }

  return { canceled, paid }
}

async function cancelPendingPayment(payment: PendingPaymentForCancel, reason: string) {
  if (!payment.yookassaId) {
    await cancelLocalPayment(payment.id, null)
    await notifyPaymentCanceled(payment.id, reason)
    return 'canceled' as const
  }

  let remoteStatus: string | null = null
  try {
    const remotePayment = await getPayment(payment.yookassaId)
    remoteStatus = remotePayment.status
    if (remotePayment.status === 'succeeded') return 'paid' as const
    if (remotePayment.status === 'canceled') {
      await cancelLocalPayment(payment.id, 'canceled')
      await notifyPaymentCanceled(payment.id, reason)
      return 'canceled' as const
    }

    const canceledPayment = await cancelPayment(payment.yookassaId, `cancel-${payment.id}`)
    remoteStatus = canceledPayment.status
    if (canceledPayment.status === 'succeeded') return 'paid' as const
  } catch (error) {
    try {
      const remotePayment = await getPayment(payment.yookassaId)
      remoteStatus = remotePayment.status
      if (remotePayment.status === 'succeeded') return 'paid' as const
      if (remotePayment.status === 'canceled') {
        await cancelLocalPayment(payment.id, 'canceled')
        await notifyPaymentCanceled(payment.id, reason)
        return 'canceled' as const
      }
    } catch {
      const message = error instanceof Error ? error.message : 'payment cancellation failed'
      remoteStatus = remoteStatus ?? `cancel_failed: ${message.slice(0, 240)}`
    }
  }

  await cancelLocalPayment(payment.id, remoteStatus)
  await notifyPaymentCanceled(payment.id, reason)
  return 'canceled' as const
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

export function getPendingPaymentTtlMs() {
  const uiTtl = readPositiveInt('PAYMENT_PENDING_UI_TTL_SECONDS')
  const cancelTtl = readPositiveInt('PAYMENT_CANCEL_PENDING_AFTER_SECONDS')
  return (uiTtl ?? cancelTtl ?? DEFAULT_PENDING_TTL_SECONDS) * 1000
}

export function getFreshPendingPaymentCutoff(now = Date.now()) {
  return new Date(now - getPendingPaymentTtlMs())
}

export async function reconcileStalePendingPaymentsForUser(userId: string, limit = 5) {
  const cutoff = getFreshPendingPaymentCutoff()
  const stalePayments = await prisma.payment.findMany({
    where: {
      userId,
      status: 'PENDING',
      createdAt: { lte: cutoff },
    },
    orderBy: { createdAt: 'asc' },
    take: limit,
    select: { id: true },
  })

  for (const payment of stalePayments) {
    await syncPaymentProvisioning({
      paymentId: payment.id,
      userId,
      cancelPendingOlderThanMs: getPendingPaymentTtlMs(),
    }).catch((error) => {
      console.error('[payment-sync] stale pending reconciliation failed', {
        paymentId: payment.id,
        userId,
        message: error instanceof Error ? error.message : 'unknown error',
      })
    })
  }

  return { checked: stalePayments.length }
}

function readPositiveInt(name: string) {
  const raw = process.env[name]
  if (!raw) return null
  const value = Number(raw)
  return Number.isInteger(value) && value > 0 ? value : null
}
