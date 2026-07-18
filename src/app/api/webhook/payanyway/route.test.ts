import { createHash } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const payment = {
    id: 'payment-1',
    userId: 'user-1',
    provider: 'PAYANYWAY',
    externalPaymentId: null,
    amountKopecks: 13000,
    status: 'PENDING',
    paidAt: null,
    subscriptionProvisionedAt: null,
    subscription: null,
    user: { id: 'user-1', email: 'user@example.com' },
    plan: {
      id: 'plan-1',
      name: 'Стандарт',
      durationDays: 7,
      trafficLimitGb: null,
      deviceLimit: 5,
      activeInternalSquads: [],
    },
  }
  return {
    payment,
    prisma: {
      payment: { findUnique: vi.fn(), update: vi.fn() },
      promoCodeRedemption: { updateMany: vi.fn() },
      $transaction: vi.fn(),
    },
    provisionPaymentSubscription: vi.fn(),
    cancelOtherPendingPaymentsForUser: vi.fn(),
    notifyPaymentStuck: vi.fn(),
    logError: vi.fn(),
    logWarn: vi.fn(),
  }
})

vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma }))
vi.mock('@/lib/provisioning', () => ({ provisionPaymentSubscription: mocks.provisionPaymentSubscription }))
vi.mock('@/lib/payment-sync', () => ({ cancelOtherPendingPaymentsForUser: mocks.cancelOtherPendingPaymentsForUser }))
vi.mock('@/lib/notifications', () => ({ notifyPaymentStuck: mocks.notifyPaymentStuck }))
vi.mock('@/lib/logger', () => ({ logError: mocks.logError, logWarn: mocks.logWarn }))
vi.mock('@/lib/payment-settings', () => ({
  getResolvedPaymentProviderSettings: vi.fn(async () => ({
    payAnyWay: {
      enabled: true,
      merchantId: '49907299',
      integrityCode: 'b'.repeat(64),
      testMode: false,
      paymentUrl: '',
    },
  })),
  isResolvedPayAnyWayConfigured: vi.fn(() => true),
}))

import { POST } from './route'

const integrityCode = 'b'.repeat(64)

describe('PayAnyWay Pay URL', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.PAYANYWAY_ENABLED = 'true'
    process.env.PAYANYWAY_MNT_ID = '49907299'
    process.env.PAYANYWAY_INTEGRITY_CODE = integrityCode
    process.env.PAYANYWAY_TEST_MODE = 'false'
    mocks.prisma.payment.findUnique.mockResolvedValue(mocks.payment)
    mocks.prisma.payment.update.mockResolvedValue({})
    mocks.prisma.promoCodeRedemption.updateMany.mockResolvedValue({ count: 0 })
    mocks.prisma.$transaction.mockImplementation(async (operations) => Promise.all(operations))
    mocks.provisionPaymentSubscription.mockResolvedValue({ subscription: { id: 'subscription-1' } })
    mocks.cancelOtherPendingPaymentsForUser.mockResolvedValue({ canceled: 0, paid: 0 })
  })

  it('marks a verified payment succeeded and provisions the subscription', async () => {
    const response = await POST(callbackRequest())

    expect(response.status).toBe(200)
    expect(await response.text()).toBe('SUCCESS')
    expect(mocks.prisma.payment.update).toHaveBeenCalledWith({
      where: { id: 'payment-1' },
      data: expect.objectContaining({
        status: 'SUCCEEDED',
        providerStatus: 'succeeded',
        externalPaymentId: 'operation-1',
      }),
    })
    expect(mocks.provisionPaymentSubscription).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user-1',
      paymentId: 'payment-1',
    }))
  })

  it('rejects a forged signature before reading the payment', async () => {
    const response = await POST(callbackRequest({ MNT_SIGNATURE: '0'.repeat(32) }))

    expect(response.status).toBe(403)
    expect(await response.text()).toBe('FAIL')
    expect(mocks.prisma.payment.findUnique).not.toHaveBeenCalled()
  })

  it('rejects a signed callback with a different amount', async () => {
    const response = await POST(callbackRequest({ MNT_AMOUNT: '131.00' }))

    expect(response.status).toBe(409)
    expect(await response.text()).toBe('FAIL')
    expect(mocks.provisionPaymentSubscription).not.toHaveBeenCalled()
  })

  it('does not provision the same operation twice', async () => {
    mocks.prisma.payment.findUnique.mockResolvedValue({
      ...mocks.payment,
      status: 'SUCCEEDED',
      externalPaymentId: 'operation-1',
      subscriptionProvisionedAt: new Date(),
      subscription: { id: 'subscription-1' },
    })

    const response = await POST(callbackRequest())

    expect(response.status).toBe(200)
    expect(await response.text()).toBe('SUCCESS')
    expect(mocks.prisma.payment.update).not.toHaveBeenCalled()
    expect(mocks.provisionPaymentSubscription).not.toHaveBeenCalled()
  })
})

function callbackRequest(overrides: Record<string, string> = {}) {
  const values = {
    MNT_ID: '49907299',
    MNT_TRANSACTION_ID: 'payment-1',
    MNT_OPERATION_ID: 'operation-1',
    MNT_AMOUNT: '130.00',
    MNT_CURRENCY_CODE: 'RUB',
    MNT_SUBSCRIBER_ID: 'user@example.com',
    MNT_TEST_MODE: '0',
    ...overrides,
  }
  const signature = md5(
    values.MNT_ID +
    values.MNT_TRANSACTION_ID +
    values.MNT_OPERATION_ID +
    values.MNT_AMOUNT +
    values.MNT_CURRENCY_CODE +
    values.MNT_SUBSCRIBER_ID +
    values.MNT_TEST_MODE +
    integrityCode
  )
  const body = new URLSearchParams({ ...values, MNT_SIGNATURE: overrides.MNT_SIGNATURE ?? signature })
  return new Request('https://cabinet.example/api/webhook/payanyway', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
}

function md5(value: string) {
  return createHash('md5').update(value).digest('hex')
}
