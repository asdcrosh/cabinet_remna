// POST /api/webhook/yookassa
// ЮKassa присылает уведомления о смене статуса платежа.
// Идемпотентность: повторный webhook не должен повторно продлевать срок,
// но обязан довыдать подписку, если прежний provisioning упал.

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { notifyPaymentCanceled, notifyPaymentStuck } from '@/lib/notifications'
import { provisionPaymentSubscription } from '@/lib/provisioning'
import { getPayment } from '@/lib/yookassa'
import { assertYookassaWebhookSource } from '@/lib/yookassa-webhook'

export const runtime = 'nodejs'

interface YookassaWebhookEvent {
  type: string
  event: 'payment.succeeded' | 'payment.canceled' | 'payment.waiting_for_capture'
  object: {
    id: string
    status: 'pending' | 'waiting_for_capture' | 'succeeded' | 'canceled'
    metadata?: Record<string, string>
  }
}

export async function POST(req: Request) {
  const sourceCheck = assertYookassaWebhookSource(req)
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

  const yookassaId = event.object.id
  const payment = await prisma.payment.findUnique({
    where: { yookassaId },
    include: { plan: true, user: true },
  })
  if (!payment) {
    console.warn(`[webhook] Payment ${yookassaId} not found in local DB`)
    return NextResponse.json({ ok: true, notFound: true })
  }

  if (payment.status === 'SUCCEEDED' && payment.subscriptionProvisionedAt) {
    await prisma.promoCodeRedemption.updateMany({
      where: { paymentId: payment.id, status: 'PENDING' },
      data: { status: 'SUCCEEDED' },
    })
    return NextResponse.json({ ok: true, idempotent: true })
  }

  let status = event.object.status
  try {
    const fresh = await getPayment(yookassaId)
    status = fresh.status
  } catch (e) {
    console.error('[webhook] getPayment failed', e)
  }

  if (status === 'succeeded') {
    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: 'SUCCEEDED',
        yookassaStatus: 'succeeded',
        paidAt: payment.paidAt ?? new Date(),
      },
    })
    await prisma.promoCodeRedemption.updateMany({
      where: { paymentId: payment.id, status: 'PENDING' },
      data: { status: 'SUCCEEDED' },
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
          trafficLimitGb: payment.plan.trafficLimitGb,
          deviceLimit: payment.plan.deviceLimit,
          activeInternalSquads: payment.plan.activeInternalSquads,
        },
      })
    } catch (e) {
      console.error('[webhook] provisionPaymentSubscription failed', e)
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
      data: { status: 'CANCELED', yookassaStatus: 'canceled' },
    })
    await prisma.promoCodeRedemption.updateMany({
      where: { paymentId: payment.id, status: 'PENDING' },
      data: { status: 'CANCELED' },
    })
    await notifyPaymentCanceled(payment.id)
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ ok: true, deferred: true })
}
