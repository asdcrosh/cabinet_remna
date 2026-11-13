import { prisma } from '@/lib/prisma'
import { recordPaymentEvent } from '@/lib/payment-events'
import { recordSucceededRefund } from '@/lib/payment-refunds'
import { miniAppBotCall } from './bot-api'
import { starsEnabled } from './stars'

type StarPayment = { currency: string; total_amount: number; invoice_payload: string; telegram_payment_charge_id: string }
type Checkout = { id: string; from: { id: number }; currency: string; total_amount: number; invoice_payload: string }

export function isOurStarsPayload(value: unknown): value is string {
  return typeof value === 'string' && /^avp:[a-z0-9]{10,64}$/.test(value)
}

export function starsPaymentMatches(payment: { provider: string; status: string; starsAmount: number | null;
  confirmationUrl: string | null; user: { telegramId: bigint | null } }, telegramId: number, currency: string, amount: number) {
  return payment.provider === 'TELEGRAM_STARS' && payment.status === 'PENDING'
    && Boolean(payment.confirmationUrl) && payment.user.telegramId === BigInt(telegramId)
    && currency === 'XTR' && payment.starsAmount === amount && amount > 0
}

export async function answerStarsPreCheckout(query: Checkout) {
  const payment = isOurStarsPayload(query.invoice_payload) && starsEnabled()
    ? await prisma.payment.findUnique({ where: { id: query.invoice_payload.slice(4) },
        include: { user: { select: { telegramId: true } } } })
    : null
  const ok = Boolean(payment && starsPaymentMatches(payment, query.from.id, query.currency, query.total_amount))
  await miniAppBotCall('answerPreCheckoutQuery', { pre_checkout_query_id: query.id, ok,
    ...(!ok ? { error_message: 'Счёт недействителен. Откройте тариф заново.' } : {}) })
}

export async function settleStarsPayment(telegramId: number, charge: StarPayment) {
  if (!isOurStarsPayload(charge.invoice_payload) || !charge.telegram_payment_charge_id) throw new Error('Invalid Stars receipt')
  const paymentId = charge.invoice_payload.slice(4)
  const payment = await prisma.payment.findUnique({ where: { id: paymentId },
    include: { user: { select: { telegramId: true } } } })
  if (!payment || payment.provider !== 'TELEGRAM_STARS' || payment.user.telegramId !== BigInt(telegramId)
      || charge.currency !== 'XTR' || payment.starsAmount !== charge.total_amount) {
    throw new Error('Stars receipt does not match the order')
  }
  if (payment.status === 'SUCCEEDED') {
    if (payment.externalPaymentId !== charge.telegram_payment_charge_id) throw new Error('Stars charge mismatch')
    return { alreadySettled: true }
  }
  if (payment.status !== 'PENDING') throw new Error('Stars order is no longer pending')
  await prisma.$transaction(async (tx) => {
    const updated = await tx.payment.updateMany({ where: { id: paymentId, provider: 'TELEGRAM_STARS', status: 'PENDING', externalPaymentId: null },
      data: { status: 'SUCCEEDED', providerStatus: 'succeeded', paidAt: new Date(), externalPaymentId: charge.telegram_payment_charge_id } })
    if (updated.count !== 1) {
      const current = await tx.payment.findUnique({ where: { id: paymentId } })
      if (current?.status !== 'SUCCEEDED' || current.externalPaymentId !== charge.telegram_payment_charge_id) throw new Error('Stars settlement conflict')
      return
    }
    await tx.promoCodeRedemption.updateMany({ where: { paymentId, status: 'PENDING' }, data: { status: 'SUCCEEDED' } })
    await tx.provisioningJob.upsert({ where: { paymentId }, create: { paymentId, status: 'PENDING', attempts: 0 }, update: {} })
  })
  await recordPaymentEvent({ paymentId, stage: 'PAYMENT', status: 'SUCCESS', source: 'telegram-stars',
    message: 'Telegram подтвердил оплату Stars', details: { starsAmount: charge.total_amount }, dedupeKey: 'payment-succeeded' })
  return { alreadySettled: false }
}

export async function refundStarsPayment(telegramId: number, charge: StarPayment) {
  if (!isOurStarsPayload(charge.invoice_payload) || !charge.telegram_payment_charge_id) throw new Error('Invalid Stars refund')
  const payment = await prisma.payment.findUnique({ where: { id: charge.invoice_payload.slice(4) },
    include: { user: { select: { telegramId: true } } } })
  if (!payment || payment.provider !== 'TELEGRAM_STARS' || payment.user.telegramId !== BigInt(telegramId)
      || payment.externalPaymentId !== charge.telegram_payment_charge_id || payment.starsAmount !== charge.total_amount
      || charge.currency !== 'XTR' || !['SUCCEEDED', 'REFUNDED'].includes(payment.status)) {
    throw new Error('Stars refund does not match the order')
  }
  await recordSucceededRefund({ paymentId: payment.id, providerRefundId: `telegram-stars:${charge.telegram_payment_charge_id}`,
    amountKopecks: payment.amountKopecks, paymentAmountKopecks: payment.amountKopecks, providerStatus: 'refunded' })
}
