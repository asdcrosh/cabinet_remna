import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const prisma = {
    payment: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
    promoCodeRedemption: {
      updateMany: vi.fn(),
    },
    user: {
      updateMany: vi.fn(),
    },
    $transaction: vi.fn(async (input) => (Array.isArray(input) ? Promise.all(input) : input)),
  }

  return {
    prisma,
    getPayment: vi.fn(),
    cancelPayment: vi.fn(),
    getPlategaTransaction: vi.fn(),
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
vi.mock('./platega', () => ({
  getPlategaTransaction: mocks.getPlategaTransaction,
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
    mocks.prisma.payment.findUnique.mockResolvedValue(null)
    mocks.prisma.user.updateMany.mockResolvedValue({ count: 0 })
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
    mocks.prisma.payment.findUnique.mockResolvedValue({
      userId: 'user-1',
      userDiscountType: 'NEXT_PURCHASE',
      discountPercent: 25,
    })
    mocks.prisma.payment.findFirst.mockResolvedValue({
      id: 'pay-1',
      provider: 'YOOKASSA',
      externalPaymentId: null,
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
      data: { status: 'CANCELED', yookassaStatus: null, providerStatus: 'canceled' },
    })
    expect(mocks.notifyPaymentCanceled).toHaveBeenCalledWith(
      'pay-1',
      'Платёж отменён, потому что ссылка на оплату устарела.'
    )
    expect(mocks.prisma.user.updateMany).toHaveBeenCalledWith({
      where: { id: 'user-1', nextPurchaseDiscountPercent: 0 },
      data: { nextPurchaseDiscountPercent: 25 },
    })
  })

  it('reconciles only stale user payments', async () => {
    mocks.prisma.payment.findMany.mockResolvedValue([{ id: 'old-pay' }])
    mocks.prisma.payment.findFirst.mockResolvedValue({
      id: 'old-pay',
      provider: 'YOOKASSA',
      externalPaymentId: null,
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

  it('locally cancels stale pending payment when YooKassa cancel fails and payment is not paid', async () => {
    mocks.prisma.payment.findFirst.mockResolvedValue({
      id: 'old-pay',
      userId: 'user-1',
      provider: 'YOOKASSA',
      externalPaymentId: null,
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
    mocks.cancelPayment.mockRejectedValue(new Error('YooKassa cancelPayment failed: 400 invalid_request'))

    const result = await syncPaymentProvisioning({
      paymentId: 'old-pay',
      userId: 'user-1',
      cancelPendingOlderThanMs: 600_000,
    })

    expect(result).toEqual({ ok: true, status: 'canceled', provisioned: false })
    expect(mocks.prisma.payment.update).toHaveBeenCalledWith({
      where: { id: 'old-pay' },
      data: { status: 'CANCELED', yookassaStatus: 'pending', providerStatus: 'pending' },
    })
  })

  it('cancels other pending user payments after one payment succeeds', async () => {
    mocks.prisma.payment.findFirst.mockResolvedValue({
      id: 'paid-pay',
      userId: 'user-1',
      provider: 'YOOKASSA',
      externalPaymentId: null,
      yookassaId: 'yoo-paid',
      status: 'PENDING',
      paidAt: null,
      subscriptionProvisionedAt: new Date('2026-06-26T11:59:00.000Z'),
      createdAt: new Date('2026-06-26T11:58:00.000Z'),
      user: { id: 'user-1', email: 'user@example.test' },
      plan: {
        id: 'plan-1',
        name: 'Стандарт',
        durationDays: 30,
        trafficLimitGb: null,
        deviceLimit: 5,
        activeInternalSquads: [],
      },
      subscription: { id: 'sub-1' },
    })
    mocks.prisma.payment.findMany.mockResolvedValue([
      { id: 'old-pay-1', userId: 'user-1', provider: 'YOOKASSA', externalPaymentId: null, yookassaId: 'yoo-old-1' },
      { id: 'old-pay-2', userId: 'user-1', provider: 'YOOKASSA', externalPaymentId: null, yookassaId: null },
    ])
    mocks.getPayment.mockResolvedValueOnce({ status: 'succeeded' }).mockResolvedValueOnce({ status: 'pending' })
    mocks.cancelPayment.mockResolvedValue({ status: 'canceled' })

    const result = await syncPaymentProvisioning({ paymentId: 'paid-pay', userId: 'user-1' })

    expect(result).toEqual({
      ok: true,
      status: 'succeeded',
      provisioned: true,
      alreadyProvisioned: true,
      subscriptionId: 'sub-1',
    })
    expect(mocks.prisma.payment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: 'user-1',
          status: 'PENDING',
          id: { not: 'paid-pay' },
        }),
      })
    )
    expect(mocks.cancelPayment).toHaveBeenCalledWith('yoo-old-1', 'cancel-old-pay-1')
    expect(mocks.prisma.payment.update).toHaveBeenCalledWith({
      where: { id: 'old-pay-2' },
      data: { status: 'CANCELED', yookassaStatus: null, providerStatus: 'canceled' },
    })
  })

  it('syncs another pending user payment if YooKassa already marked it paid', async () => {
    const mainPayment = {
      id: 'paid-pay',
      userId: 'user-1',
      provider: 'YOOKASSA',
      externalPaymentId: null,
      yookassaId: 'yoo-paid',
      status: 'PENDING',
      paidAt: null,
      subscriptionProvisionedAt: new Date('2026-06-26T11:59:00.000Z'),
      createdAt: new Date('2026-06-26T11:58:00.000Z'),
      user: { id: 'user-1', email: 'user@example.test' },
      plan: {
        id: 'plan-1',
        name: 'Стандарт',
        durationDays: 30,
        trafficLimitGb: null,
        deviceLimit: 5,
        activeInternalSquads: [],
      },
      subscription: { id: 'sub-main' },
    }
    const siblingPayment = {
      ...mainPayment,
      id: 'old-paid',
      yookassaId: 'yoo-old-paid',
      subscription: { id: 'sub-old' },
    }

    mocks.prisma.payment.findFirst
      .mockResolvedValueOnce(mainPayment)
      .mockResolvedValueOnce(siblingPayment)
    mocks.prisma.payment.findMany
      .mockResolvedValueOnce([{ id: 'old-paid', userId: 'user-1', provider: 'YOOKASSA', externalPaymentId: null, yookassaId: 'yoo-old-paid' }])
      .mockResolvedValueOnce([])
    mocks.getPayment
      .mockResolvedValueOnce({ status: 'succeeded' })
      .mockResolvedValueOnce({ status: 'succeeded' })
      .mockResolvedValueOnce({ status: 'succeeded' })

    const result = await syncPaymentProvisioning({ paymentId: 'paid-pay', userId: 'user-1' })

    expect(result).toEqual({
      ok: true,
      status: 'succeeded',
      provisioned: true,
      alreadyProvisioned: true,
      subscriptionId: 'sub-main',
    })
    expect(mocks.cancelPayment).not.toHaveBeenCalled()
    expect(mocks.prisma.payment.update).toHaveBeenCalledWith({
      where: { id: 'old-paid' },
      data: expect.objectContaining({
        status: 'SUCCEEDED',
        yookassaStatus: 'succeeded',
      }),
    })
  })

  it('confirms and provisions a Platega payment from the status API', async () => {
    mocks.prisma.payment.findFirst.mockResolvedValue(plategaPayment())
    mocks.prisma.payment.findMany.mockResolvedValue([])
    mocks.getPlategaTransaction.mockResolvedValue({
      id: 'platega-1',
      status: 'CONFIRMED',
      paymentDetails: { amount: 599, currency: 'RUB' },
      paymentMethod: 2,
      expiresIn: null,
      payload: 'pay-platega',
    })
    mocks.provisionPaymentSubscription.mockResolvedValue({ subscription: { id: 'sub-platega' } })

    await expect(syncPaymentProvisioning({ paymentId: 'pay-platega', userId: 'user-1' })).resolves.toEqual({
      ok: true,
      status: 'succeeded',
      provisioned: true,
      subscriptionId: 'sub-platega',
    })

    expect(mocks.prisma.payment.update).toHaveBeenCalledWith({
      where: { id: 'pay-platega' },
      data: expect.objectContaining({
        status: 'SUCCEEDED',
        providerStatus: 'CONFIRMED',
        provisioningError: null,
      }),
    })
    expect(mocks.provisionPaymentSubscription).toHaveBeenCalledWith(
      expect.objectContaining({ paymentId: 'pay-platega', userId: 'user-1' })
    )
  })

  it('uses the imported Remnashop payment id to check YooKassa before expiring it', async () => {
    mocks.prisma.payment.findFirst.mockResolvedValue({
      id: 'imported-pay',
      userId: 'user-1',
      provider: 'YOOKASSA',
      externalPaymentId: 'yoo-imported',
      yookassaId: null,
      status: 'PENDING',
      paidAt: null,
      subscriptionProvisionedAt: null,
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
    mocks.prisma.payment.findMany.mockResolvedValue([])
    mocks.getPayment.mockResolvedValue({ status: 'succeeded' })
    mocks.provisionPaymentSubscription.mockResolvedValue({ subscription: { id: 'sub-imported' } })

    await expect(syncPaymentProvisioning({
      paymentId: 'imported-pay',
      userId: 'user-1',
      cancelPendingOlderThanMs: 600_000,
    })).resolves.toEqual({
      ok: true,
      status: 'succeeded',
      provisioned: true,
      subscriptionId: 'sub-imported',
    })

    expect(mocks.getPayment).toHaveBeenCalledWith('yoo-imported')
    expect(mocks.cancelPayment).not.toHaveBeenCalled()
    expect(mocks.notifyPaymentCanceled).not.toHaveBeenCalled()
  })

  it('keeps a pending Platega payment active without canceling it by the local TTL', async () => {
    mocks.prisma.payment.findFirst.mockResolvedValue(plategaPayment())
    mocks.getPlategaTransaction.mockResolvedValue({
      id: 'platega-1',
      status: 'PENDING',
      paymentDetails: { amount: 599, currency: 'RUB' },
      paymentMethod: null,
      expiresIn: '2026-06-26T12:15:00.000Z',
      payload: 'pay-platega',
    })

    await expect(
      syncPaymentProvisioning({
        paymentId: 'pay-platega',
        userId: 'user-1',
        cancelPendingOlderThanMs: 1,
      })
    ).resolves.toEqual({ ok: true, status: 'pending', provisioned: false })

    expect(mocks.prisma.payment.update).toHaveBeenCalledWith({
      where: { id: 'pay-platega' },
      data: { providerStatus: 'PENDING', provisioningError: null },
    })
    expect(mocks.notifyPaymentCanceled).not.toHaveBeenCalled()
  })

  it('does not fail a pending Platega payment with intermediate amount details', async () => {
    mocks.prisma.payment.findFirst.mockResolvedValue(plategaPayment())
    mocks.getPlategaTransaction.mockResolvedValue({
      id: 'platega-1',
      status: 'PENDING',
      paymentDetails: { amount: 1, currency: 'RUB' },
      paymentMethod: null,
      expiresIn: '2026-06-26T12:15:00.000Z',
      payload: 'pay-platega',
    })

    await expect(
      syncPaymentProvisioning({ paymentId: 'pay-platega', userId: 'user-1' })
    ).resolves.toEqual({ ok: true, status: 'pending', provisioned: false })

    expect(mocks.provisionPaymentSubscription).not.toHaveBeenCalled()
  })

  it('accepts a confirmed Platega amount that includes payer commission', async () => {
    mocks.prisma.payment.findFirst.mockResolvedValue(plategaPayment())
    mocks.prisma.payment.findMany.mockResolvedValue([])
    mocks.getPlategaTransaction.mockResolvedValue({
      id: 'platega-1',
      status: 'CONFIRMED',
      paymentDetails: { amount: 646.92, currency: 'RUB' },
      paymentMethod: 2,
      expiresIn: null,
      payload: 'pay-platega',
    })
    mocks.provisionPaymentSubscription.mockResolvedValue({ subscription: { id: 'sub-platega' } })

    await expect(
      syncPaymentProvisioning({ paymentId: 'pay-platega', userId: 'user-1' })
    ).resolves.toEqual({
      ok: true,
      status: 'succeeded',
      provisioned: true,
      subscriptionId: 'sub-platega',
    })
  })

  it('rejects a confirmed Platega status response below the order amount', async () => {
    mocks.prisma.payment.findFirst.mockResolvedValue(plategaPayment())
    mocks.getPlategaTransaction.mockResolvedValue({
      id: 'platega-1',
      status: 'CONFIRMED',
      paymentDetails: { amount: 1, currency: 'RUB' },
      paymentMethod: 2,
      expiresIn: null,
      payload: 'pay-platega',
    })

    const result = await syncPaymentProvisioning({ paymentId: 'pay-platega', userId: 'user-1' })

    expect(result).toEqual({
      ok: false,
      status: 'check_failed',
      provisioned: false,
      error: 'Platega transaction amount below expected: expected 59900, received 100',
    })
    expect(mocks.provisionPaymentSubscription).not.toHaveBeenCalled()
  })
})

function plategaPayment() {
  return {
    id: 'pay-platega',
    userId: 'user-1',
    provider: 'PLATEGA',
    externalPaymentId: 'platega-1',
    yookassaId: null,
    amountKopecks: 59_900,
    status: 'PENDING',
    paidAt: null,
    subscriptionProvisionedAt: null,
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
  }
}
