import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { logError, logWarn } from '@/lib/logger'
import { notifyPaymentStuck } from '@/lib/notifications'
import { cancelOtherPendingPaymentsForUser } from '@/lib/payment-sync'
import {
  createPayAnyWayReceiptResponse,
  parsePayAnyWayCallback,
  verifyPayAnyWayCallback,
} from '@/lib/payanyway'
import { provisionPaymentSubscription } from '@/lib/provisioning'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  return handlePayAnyWayRequest(new URL(req.url).searchParams)
}

export async function POST(req: Request) {
  let params: URLSearchParams
  try {
    const form = await req.formData()
    params = new URLSearchParams()
    for (const [key, value] of form.entries()) {
      if (typeof value === 'string') params.append(key, value)
    }
  } catch {
    return payAnyWayResponse('FAIL', 400)
  }
  return handlePayAnyWayRequest(params)
}

async function handlePayAnyWayRequest(params: URLSearchParams) {
  const callback = parsePayAnyWayCallback(params)
  // PayAnyWay проверяет доступность Pay URL пустым запросом при сохранении настроек.
  if (!callback) return payAnyWayResponse('SUCCESS')

  let verification: Awaited<ReturnType<typeof verifyPayAnyWayCallback>>
  try {
    verification = await verifyPayAnyWayCallback(callback)
  } catch (error) {
    logError('webhook.payanyway.configuration_failed', error)
    return payAnyWayResponse('FAIL', 503)
  }
  if (!verification.ok) {
    logWarn('webhook.payanyway.rejected', {
      transactionId: callback.transactionId || 'missing',
      reason: verification.error,
    })
    return payAnyWayResponse('FAIL', 403)
  }

  const payment = await prisma.payment.findUnique({
    where: { id: callback.transactionId },
    include: { plan: true, user: true, subscription: true },
  })
  if (!payment || payment.provider !== 'PAYANYWAY') {
    logWarn('webhook.payanyway.payment_not_found', { transactionId: callback.transactionId })
    return payAnyWayResponse('FAIL', 404)
  }
  if (payment.amountKopecks !== verification.amountKopecks) {
    logWarn('webhook.payanyway.amount_mismatch', {
      paymentId: payment.id,
      expected: payment.amountKopecks,
      received: verification.amountKopecks,
    })
    return payAnyWayResponse('FAIL', 409)
  }
  if (
    callback.subscriberId &&
    callback.subscriberId !== payment.user.email &&
    callback.subscriberId !== payment.userId
  ) {
    logWarn('webhook.payanyway.subscriber_mismatch', { paymentId: payment.id })
    return payAnyWayResponse('FAIL', 409)
  }
  if (payment.externalPaymentId && payment.externalPaymentId !== callback.operationId) {
    logWarn('webhook.payanyway.operation_mismatch', { paymentId: payment.id })
    return payAnyWayResponse('FAIL', 409)
  }

  let receiptResponse: string
  try {
    receiptResponse = await createPayAnyWayReceiptResponse({
      merchantId: callback.merchantId,
      transactionId: payment.id,
      amountKopecks: payment.amountKopecks,
      itemName: `Доступ к сервису ${payment.plan.name} на ${payment.plan.durationDays} дн.`,
      customerEmail: payment.user.email,
    })
  } catch (error) {
    logError('webhook.payanyway.receipt_failed', error, { paymentId: payment.id })
    return payAnyWayResponse('FAIL', 500)
  }

  if (payment.status !== 'SUCCEEDED') {
    try {
      await prisma.$transaction([
        prisma.payment.update({
          where: { id: payment.id },
          data: {
            status: 'SUCCEEDED',
            providerStatus: 'succeeded',
            externalPaymentId: callback.operationId,
            paidAt: payment.paidAt ?? new Date(),
            provisioningError: null,
          },
        }),
        prisma.promoCodeRedemption.updateMany({
          where: { paymentId: payment.id, status: 'PENDING' },
          data: { status: 'SUCCEEDED' },
        }),
      ])
      await cancelOtherPendingPaymentsForUser(payment.userId, payment.id)
    } catch (error) {
      logError('webhook.payanyway.payment_update_failed', error, { paymentId: payment.id })
      return payAnyWayResponse('FAIL', 500)
    }
  }

  if (payment.subscriptionProvisionedAt && payment.subscription) {
    return payAnyWayXmlResponse(receiptResponse)
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
  } catch (error) {
    const message = error instanceof Error ? error.message : 'subscription provisioning failed'
    logError('webhook.payanyway.provision_failed', error, { paymentId: payment.id })
    await prisma.payment.update({
      where: { id: payment.id },
      data: { provisioningError: message.slice(0, 1000) },
    }).catch(() => null)
    await notifyPaymentStuck(payment.id, 'Платёж прошёл, но подписка пока не выдана автоматически.')
    // Оплату уже надёжно записали. Внутренний worker выполнит повторную выдачу.
  }

  return payAnyWayXmlResponse(receiptResponse)
}

function payAnyWayResponse(body: 'SUCCESS' | 'FAIL', status = 200) {
  return new NextResponse(body, {
    status,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
}

function payAnyWayXmlResponse(body: string) {
  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  })
}
