import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const prisma = {
    payment: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
    promoCodeRedemption: {
      updateMany: vi.fn(),
    },
    $transaction: vi.fn(async (input) => (Array.isArray(input) ? Promise.all(input) : input)),
  }

  return {
    prisma,
    getPayment: vi.fn(),
    cancelPayment: vi.fn(),
    provisionPaymentSubscription: vi.fn(),
    notifyPaymentCanceled: vi.fn(),
    notifyPaymentStuck: vi.fn(),
  }
})

vi.mock('./prisma', () => ({ prisma: mocks.prisma }))
vi.mock('./yookassa', () => ({
  getPayment: mocks.getPayment,
  cancelPayment: mocks.cancelPayment,
}))
vi.mock('./provisioning', () => ({
  provisionPaymentSubscription: mocks.provisionPaymentSubscription,
}))
vi.mock('./notifications', () => ({
  notifyPaymentCanceled: mocks.notifyPaymentCanceled,
  notifyPaymentStuck: mocks.notifyPaymentStuck,
}))

import {
  getFreshPendingPaymentCutoff,
  getPendingPaymentTtlMs,
  reconcileStalePendingPaymentsForUser,
  syncPaymentProvisioning,
} from './payment-sync'

describe('payment sync pending expiration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-26T12:00:00.000Z'))
    delete process.env.PAYMENT_PENDING_UI_TTL_SECONDS
    delete process.env.PAYMENT_CANCEL_PENDING_AFTER_SECONDS
    mocks.prisma.payment.update.mockResolvedValue({})
    mocks.prisma.promoCodeRedemption.updateMany.mockResolvedValue({ count: 0 })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('uses UI TTL before payment cancellation TTL', () => {
    process.env.PAYMENT_CANCEL_PENDING_AFTER_SECONDS = '1200'
    process.env.PAYMENT_PENDING_UI_TTL_SECONDS = '300'

    expect(getPendingPaymentTtlMs()).toBe(300_000)
    expect(getFreshPendingPaymentCutoff().toISOString()).toBe('2026-06-26T11:55:00.000Z')
  })

  it('locally cancels stale pending payments without YooKassa id', async () => {
    mocks.prisma.payment.findFirst.mockResolvedValue({
      id: 'pay-1',
      yookassaId: null,
      status: 'PENDING',
      createdAt: new Date('2026-06-26T11:40:00.000Z'),
      user: { id: 'user-1', email: 'user@example.test' },
      plan: {
        id: 'plan-1',
        name: 'Стандарт',
        durationDays: 30,
        trafficLimitGb: null,
        deviceLimit: 5,
        activeInternalSquads: [],
      },
      subscription: null,
    })

    const result = await syncPaymentProvisioning({
      paymentId: 'pay-1',
      userId: 'user-1',
      cancelPendingOlderThanMs: 600_000,
    })

    expect(result).toEqual({ ok: true, status: 'canceled', provisioned: false })
    expect(mocks.prisma.payment.update).toHaveBeenCalledWith({
      where: { id: 'pay-1' },
      data: { status: 'CANCELED', yookassaStatus: null },
    })
    expect(mocks.notifyPaymentCanceled).toHaveBeenCalledWith(
      'pay-1',
      'Платёж отменён, потому что ссылка на оплату устарела.'
    )
  })

  it('reconciles only stale user payments', async () => {
    mocks.prisma.payment.findMany.mockResolvedValue([{ id: 'old-pay' }])
    mocks.prisma.payment.findFirst.mockResolvedValue({
      id: 'old-pay',
      yookassaId: 'yoo-1',
      status: 'PENDING',
      createdAt: new Date('2026-06-26T11:40:00.000Z'),
      user: { id: 'user-1', email: 'user@example.test' },
      plan: {
        id: 'plan-1',
        name: 'Стандарт',
        durationDays: 30,
        trafficLimitGb: null,
        deviceLimit: 5,
        activeInternalSquads: [],
      },
      subscription: null,
    })
    mocks.getPayment.mockResolvedValue({ status: 'pending' })
    mocks.cancelPayment.mockResolvedValue({ status: 'canceled' })

    await expect(reconcileStalePendingPaymentsForUser('user-1')).resolves.toEqual({ checked: 1 })

    expect(mocks.prisma.payment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: 'user-1',
          status: 'PENDING',
          createdAt: { lte: new Date('2026-06-26T11:50:00.000Z') },
        }),
      })
    )
    expect(mocks.cancelPayment).toHaveBeenCalledWith('yoo-1', 'cancel-old-pay')
  })
})
