// POST /api/webhook/yookassa
// ЮKassa присылает уведомления о смене статуса платежа.
// Идемпотентность: повторный webhook не должен повторно продлевать срок,
// но обязан довыдать подписку, если прежний provisioning упал.

import { NextResponse } from 'next/server'
import { logError, logWarn } from '@/lib/logger'
import { prisma } from '@/lib/prisma'
import { notifyPaymentCanceled, notifyPaymentStuck } from '@/lib/notifications'
import { provisionPaymentSubscription } from '@/lib/provisioning'
import { getPayment, type YooPayment } from '@/lib/yookassa'
import { assertYookassaWebhookSource } from '@/lib/yookassa-webhook'
import { getResolvedPaymentProviderSettings } from '@/lib/payment-settings'
import { recordSucceededRefund } from '@/lib/payment-refunds'
import { terminateUserSubscription } from '@/lib/subscription-termination'
import { paymentErrorDetails, recordPaymentEvent } from '@/lib/payment-events'
import {
  captureSavedPaymentMethodBestEffort,
  registerAutoRenewalFailureBestEffort,
} from '@/lib/auto-renewal'
import { restoreNextPurchaseDiscountBestEffort } from '@/lib/user-discounts'

export const runtime = 'nodejs'

interface YookassaPaymentWebhookEvent {
  type: string
  event: 'payment.succeeded' | 'payment.canceled' | 'payment.waiting_for_capture'
  object: {
    id: string
    status: 'pending' | 'waiting_for_capture' | 'succeeded' | 'canceled'
    metadata?: Record<string, string>
  }
}

interface YookassaRefundWebhookEvent {
  type: string
  event: 'refund.succeeded'
  object: {
    id: string
    status: 'succeeded'
    payment_id: string
    amount: {
      value: string
      currency: string
    }
  }
}

type YookassaWebhookEvent = YookassaPaymentWebhookEvent | YookassaRefundWebhookEvent

export async function POST(req: Request) {
  const settings = await getResolvedPaymentProviderSettings()
  const sourceCheck = assertYookassaWebhookSource(req, settings.yookassa.webhookAllowedIps)
  if (!sourceCheck.ok) {
    return NextResponse.json({ error: sourceCheck.error }, { status: 403 })
  }

  let event: YookassaWebhookEvent
  try {
    event = (await req.json()) as YookassaWebhookEvent
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (event.type !== 'notification') {
    return NextResponse.json({ ok: true, skipped: true })
  }

  if (event.event === 'refund.succeeded') {
    return handleSucceededRefund(event)
  }

  const yookassaId = event.object.id
  let payment = await prisma.payment.findUnique({
    where: { yookassaId },
    include: { plan: true, user: true },
  })
  const metadataPaymentId = event.object.metadata?.localPaymentId
  if (!payment && metadataPaymentId) {
    payment = await prisma.payment.findFirst({
      where: { id: metadataPaymentId, provider: 'YOOKASSA' },
      include: { plan: true, user: true },
    })
    if (payment) {
      await prisma.payment.update({
        where: { id: payment.id },
        data: { yookassaId, externalPaymentId: yookassaId },
      })
    }
  }
  if (!payment) {
    logWarn('webhook.payment_not_found', { yookassaId })
    return NextResponse.json({ ok: true, notFound: true })
  }

  await recordPaymentEvent({
    paymentId: payment.id,
    stage: 'WEBHOOK',
    status: 'INFO',
    source: 'yookassa-webhook',
    message: `Получено уведомление ЮKassa: ${event.event}`,
    details: { providerStatus: event.object.status, externalPaymentId: yookassaId },
    dedupeKey: `webhook-${event.event}`,
  })

  if (payment.status === 'SUCCEEDED' && payment.subscriptionProvisionedAt) {
    try {
      await captureSavedPaymentMethodBestEffort({
        localPaymentId: payment.id,
        providerPayment: await getPayment(yookassaId),
      })
    } catch (error) {
      logError('webhook.saved_payment_method_refresh_failed', error, { paymentId: payment.id, yookassaId })
    }
    await prisma.promoCodeRedemption.updateMany({
      where: { paymentId: payment.id, status: 'PENDING' },
      data: { status: 'SUCCEEDED' },
    })
    return NextResponse.json({ ok: true, idempotent: true })
  }

  let status = event.object.status
  let freshPayment: YooPayment
  try {
    freshPayment = await getPayment(yookassaId)
    status = freshPayment.status
  } catch (e) {
    logError('webhook.get_payment_failed', e, { yookassaId })
    await recordPaymentEvent({
      paymentId: payment.id,
      stage: 'PROVIDER',
      status: 'WARNING',
      source: 'yookassa-webhook',
      message: 'Не удалось перепроверить статус в ЮKassa, изменения платежа не применены',
      details: paymentErrorDetails(e),
      dedupeKey: 'provider-status-check-failed',
    })
    return NextResponse.json(
      { error: 'provider-status-unavailable' },
      { status: 503, headers: { 'Retry-After': '30' } }
    )
  }

  if (status === 'succeeded') {
    await captureSavedPaymentMethodBestEffort({
      localPaymentId: payment.id,
      providerPayment: freshPayment,
    })
    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: 'SUCCEEDED',
        yookassaStatus: 'succeeded',
        providerStatus: 'succeeded',
        paidAt: payment.paidAt ?? new Date(),
      },
    })
    await prisma.promoCodeRedemption.updateMany({
      where: { paymentId: payment.id, status: 'PENDING' },
      data: { status: 'SUCCEEDED' },
    })
    await recordPaymentEvent({
      paymentId: payment.id,
      stage: 'PAYMENT',
      status: 'SUCCESS',
      source: 'yookassa-webhook',
      message: 'Оплата подтверждена ЮKassa',
      dedupeKey: 'payment-succeeded',
    })

    if (!payment.user || !payment.plan) {
      return NextResponse.json({ error: 'payment-relations-missing' }, { status: 500 })
    }

    try {
      await provisionPaymentSubscription({
        userId: payment.user.id,
        email: payment.user.email,
        paymentId: payment.id,
        plan: {
          id: payment.plan.id,
          name: payment.plan.name,
          durationDays: payment.plan.durationDays,
          unlimitedDuration: payment.plan.unlimitedDuration,
          trafficLimitGb: payment.plan.trafficLimitGb,
          deviceLimit: payment.plan.deviceLimit,
          unlimitedDevices: payment.plan.unlimitedDevices,
          activeInternalSquads: payment.plan.activeInternalSquads,
        },
      })
    } catch (e) {
      logError('webhook.provision_failed', e, { paymentId: payment.id, yookassaId })
      await prisma.payment.update({
        where: { id: payment.id },
        data: {
          provisioningError: e instanceof Error ? e.message.slice(0, 1000) : 'subscription provisioning failed',
        },
      })
      await notifyPaymentStuck(payment.id, 'Платёж прошёл, но подписка пока не выдана автоматически.')
      return NextResponse.json({ error: 'subscription-failed' }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  }

  if (status === 'canceled') {
    await prisma.payment.update({
      where: { id: payment.id },
      data: { status: 'CANCELED', yookassaStatus: 'canceled', providerStatus: 'canceled' },
    })
    await prisma.promoCodeRedemption.updateMany({
      where: { paymentId: payment.id, status: 'PENDING' },
      data: { status: 'CANCELED' },
    })
    if (payment.status === 'PENDING') {
      await restoreNextPurchaseDiscountBestEffort(payment.id)
    }
    await notifyPaymentCanceled(payment.id)
    await registerAutoRenewalFailureBestEffort(
      payment.id,
      freshPayment.cancellation_details?.reason ?? 'ЮKassa отменила автоплатёж'
    )
    await recordPaymentEvent({
      paymentId: payment.id,
      stage: 'PAYMENT',
      status: 'WARNING',
      source: 'yookassa-webhook',
      message: 'Платёж отменён ЮKassa',
      dedupeKey: 'payment-canceled',
    })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ ok: true, deferred: true })
}

async function handleSucceededRefund(event: YookassaRefundWebhookEvent) {
  const refund = event.object
  const amountKopecks = moneyToKopecks(refund.amount.value)
  if (
    !refund.id ||
    !refund.payment_id ||
    refund.status !== 'succeeded' ||
    refund.amount.currency.toUpperCase() !== 'RUB' ||
    amountKopecks == null
  ) {
    return NextResponse.json({ error: 'Invalid refund payload' }, { status: 400 })
  }

  const payment = await prisma.payment.findUnique({
    where: { yookassaId: refund.payment_id },
    select: {
      id: true,
      userId: true,
      amountKopecks: true,
      purchaseType: true,
    },
  })
  if (!payment) {
    logWarn('webhook.yookassa.refund_payment_not_found', {
      refundId: refund.id,
      yookassaId: refund.payment_id,
    })
    return NextResponse.json({ ok: true, notFound: true })
  }

  const result = await recordSucceededRefund({
    paymentId: payment.id,
    providerRefundId: `yookassa-refund:${refund.id}`,
    amountKopecks,
    paymentAmountKopecks: payment.amountKopecks,
    providerStatus: 'refund.succeeded',
  })
  if (!result.fullyRefunded) {
    return NextResponse.json({
      ok: true,
      partialRefund: true,
      refundedAmountKopecks: result.refundedAmountKopecks,
    })
  }

  if (payment.purchaseType === 'WHITELIST_ADDON' || payment.purchaseType === 'DEVICE_LIMIT_ADDON') {
    return NextResponse.json({ ok: true, refunded: true })
  }

  try {
    await terminateUserSubscription({
      userId: payment.userId,
      source: 'YOOKASSA_REFUND',
      paymentId: payment.id,
    })
  } catch (error) {
    logError('webhook.yookassa.refund_revoke_failed', error, {
      paymentId: payment.id,
      refundId: refund.id,
    })
    return NextResponse.json({ error: 'Subscription removal failed' }, { status: 503 })
  }

  return NextResponse.json({ ok: true, refunded: true })
}

function moneyToKopecks(value: string) {
  if (!/^\d+(?:\.\d{1,2})?$/.test(value)) return null
  const [rubles, kopecks = ''] = value.split('.')
  const amount = Number(rubles) * 100 + Number(kopecks.padEnd(2, '0'))
  return Number.isSafeInteger(amount) && amount > 0 ? amount : null
}
