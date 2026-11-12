import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  findPayment: vi.fn(), updatePayment: vi.fn(), findTransactionPayment: vi.fn(),
  updatePromo: vi.fn(), upsertJob: vi.fn(), botCall: vi.fn(), paymentEvent: vi.fn(), refund: vi.fn(),
}))
vi.mock('@/lib/prisma', () => ({ prisma: {
  payment: { findUnique: mocks.findPayment },
  $transaction: async (callback: (tx: unknown) => Promise<unknown>) => callback({
    payment: { updateMany: mocks.updatePayment, findUnique: mocks.findTransactionPayment },
    promoCodeRedemption: { updateMany: mocks.updatePromo },
    provisioningJob: { upsert: mocks.upsertJob },
  }),
} }))
vi.mock('./bot-api', () => ({ miniAppBotCall: mocks.botCall }))
vi.mock('@/lib/payment-events', () => ({ recordPaymentEvent: mocks.paymentEvent }))
vi.mock('@/lib/payment-refunds', () => ({ recordSucceededRefund: mocks.refund }))

import { answerStarsPreCheckout, refundStarsPayment, settleStarsPayment, starsPaymentMatches } from './stars-payments'

const payment = { id: 'ck12345678901234567890', provider: 'TELEGRAM_STARS', status: 'PENDING',
  starsAmount: 100, confirmationUrl: 'https://t.me/$invoice', externalPaymentId: null, amountKopecks: 30_000,
  user: { telegramId: 123n } }
const receipt = { currency: 'XTR', total_amount: 100,
  invoice_payload: 'avp:ck12345678901234567890', telegram_payment_charge_id: 'tg-charge-1' }

describe('Telegram Stars settlement', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('TELEGRAM_MINIAPP_ENABLED', 'true')
    vi.stubEnv('TELEGRAM_STARS_ENABLED', 'true')
    mocks.findPayment.mockResolvedValue(payment)
    mocks.updatePayment.mockResolvedValue({ count: 1 })
    mocks.updatePromo.mockResolvedValue({ count: 0 })
    mocks.upsertJob.mockResolvedValue({})
    mocks.paymentEvent.mockResolvedValue(null)
    mocks.refund.mockResolvedValue({ fullyRefunded: true })
    mocks.botCall.mockResolvedValue(true)
  })

  it('rejects a changed payer, currency or amount before checkout', async () => {
    expect(starsPaymentMatches(payment, 124, 'XTR', 100)).toBe(false)
    expect(starsPaymentMatches(payment, 123, 'RUB', 100)).toBe(false)
    expect(starsPaymentMatches(payment, 123, 'XTR', 99)).toBe(false)
    await answerStarsPreCheckout({ id: 'query', from: { id: 123 }, currency: 'XTR', total_amount: 99,
      invoice_payload: receipt.invoice_payload })
    expect(mocks.botCall).toHaveBeenCalledWith('answerPreCheckoutQuery', expect.objectContaining({ ok: false }))
  })

  it('settles a verified charge once and queues the shared Cabinet provisioning worker', async () => {
    await settleStarsPayment(123, receipt)
    expect(mocks.updatePayment).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ status: 'PENDING', provider: 'TELEGRAM_STARS' }),
      data: expect.objectContaining({ status: 'SUCCEEDED', externalPaymentId: 'tg-charge-1' }),
    }))
    expect(mocks.upsertJob).toHaveBeenCalledWith(expect.objectContaining({
      where: { paymentId: payment.id }, create: expect.objectContaining({ status: 'PENDING' }),
    }))
    expect(mocks.updatePromo).toHaveBeenCalled()
  })

  it('does not credit a duplicate receipt or a different charge', async () => {
    mocks.findPayment.mockResolvedValue({ ...payment, status: 'SUCCEEDED', externalPaymentId: 'tg-charge-1' })
    expect(await settleStarsPayment(123, receipt)).toEqual({ alreadySettled: true })
    expect(mocks.updatePayment).not.toHaveBeenCalled()
    await expect(settleStarsPayment(123, { ...receipt, telegram_payment_charge_id: 'other' })).rejects.toThrow('mismatch')
  })

  it('records a verified refund against the same payment', async () => {
    mocks.findPayment.mockResolvedValue({ ...payment, status: 'SUCCEEDED', externalPaymentId: 'tg-charge-1' })
    await refundStarsPayment(123, receipt)
    expect(mocks.refund).toHaveBeenCalledWith({ paymentId: payment.id,
      providerRefundId: 'telegram-stars:tg-charge-1', amountKopecks: 30_000,
      paymentAmountKopecks: 30_000, providerStatus: 'refunded' })
  })
})
