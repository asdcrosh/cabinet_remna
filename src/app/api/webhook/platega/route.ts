import { NextResponse } from 'next/server'
import { z } from 'zod'
import { logError, logWarn } from '@/lib/logger'
import { notifyPaymentCanceled } from '@/lib/notifications'
import { prisma } from '@/lib/prisma'
import { verifyPlategaCallbackHeaders } from '@/lib/platega'
import { cancelOtherPendingPaymentsForUser, syncPaymentProvisioning } from '@/lib/payment-sync'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const callbackSchema = z.object({
  id: z.string().trim().min(1).max(100),
  amount: z.number().finite().nonnegative(),
  currency: z.string().trim().length(3),
  status: z.enum(['CONFIRMED', 'CANCELED', 'CHARGEBACKED']),
  paymentMethod: z.union([z.number().int(), z.string().trim().min(1)]),
}).passthrough()

export async function POST(request: Request) {
  const verification = await verifyPlategaCallbackHeaders(request)
  if (!verification.ok) {
    logWarn('webhook.platega.rejected', { reason: verification.error })
    return NextResponse.json(
      { error: verification.error },
      { status: verification.error === 'not_configured' ? 503 : 403 }
    )
  }

  const parsed = callbackSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid callback payload' }, { status: 400 })
  }

  const callback = parsed.data
  const payment = await prisma.payment.findFirst({
    where: {
      provider: 'PLATEGA',
      externalPaymentId: callback.id,
    },
    select: {
      id: true,
      userId: true,
      amountKopecks: true,
      status: true,
      paidAt: true,
    },
  })
  if (!payment) {
    logWarn('webhook.platega.payment_not_found', { transactionId: callback.id })
    return NextResponse.json({ error: 'Payment not found' }, { status: 503 })
  }

  const amountKopecks = Math.round(callback.amount * 100)
  if (callback.currency.toUpperCase() !== 'RUB' || amountKopecks !== payment.amountKopecks) {
    logWarn('webhook.platega.payment_mismatch', {
      paymentId: payment.id,
      expectedAmountKopecks: payment.amountKopecks,
      receivedAmountKopecks: amountKopecks,
      currency: callback.currency,
    })
    return NextResponse.json({ error: 'Payment amount mismatch' }, { status: 409 })
  }

  if (callback.status === 'CHARGEBACKED') {
    await prisma.$transaction([
      prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: 'REFUNDED',
          providerStatus: callback.status,
        },
      }),
      prisma.promoCodeRedemption.updateMany({
        where: { paymentId: payment.id, status: 'PENDING' },
        data: { status: 'CANCELED' },
      }),
    ])
    logWarn('webhook.platega.chargeback', { paymentId: payment.id, transactionId: callback.id })
    return new NextResponse(null, { status: 200 })
  }

  if (callback.status === 'CANCELED') {
    if (payment.status === 'PENDING') {
      await prisma.$transaction([
        prisma.payment.update({
          where: { id: payment.id },
          data: { status: 'CANCELED', providerStatus: callback.status },
        }),
        prisma.promoCodeRedemption.updateMany({
          where: { paymentId: payment.id, status: 'PENDING' },
          data: { status: 'CANCELED' },
        }),
      ])
      await notifyPaymentCanceled(payment.id)
    }
    return new NextResponse(null, { status: 200 })
  }

  if (payment.status === 'REFUNDED') {
    return new NextResponse(null, { status: 200 })
  }
  if (payment.status !== 'SUCCEEDED') {
    await prisma.$transaction([
      prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: 'SUCCEEDED',
          providerStatus: callback.status,
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
  }

  const syncResult = await syncPaymentProvisioning({
    paymentId: payment.id,
    userId: payment.userId,
  }).catch((error) => {
    logError('webhook.platega.provision_failed', error, { paymentId: payment.id })
    return null
  })
  if (syncResult && !syncResult.ok) {
    logWarn('webhook.platega.provision_deferred', {
      paymentId: payment.id,
      status: syncResult.status,
    })
  }

  return new NextResponse(null, { status: 200 })
}
