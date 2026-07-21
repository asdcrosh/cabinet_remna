import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  verifyHeaders: vi.fn(),
  syncPaymentProvisioning: vi.fn(),
  cancelOtherPendingPaymentsForUser: vi.fn(),
  notifyPaymentCanceled: vi.fn(),
  logWarn: vi.fn(),
  logError: vi.fn(),
  paymentFindFirst: vi.fn(),
  paymentUpdate: vi.fn(),
  redemptionUpdateMany: vi.fn(),
  transaction: vi.fn(),
}))

vi.mock('@/lib/platega', () => ({ verifyPlategaCallbackHeaders: mocks.verifyHeaders }))
vi.mock('@/lib/payment-sync', () => ({
  syncPaymentProvisioning: mocks.syncPaymentProvisioning,
  cancelOtherPendingPaymentsForUser: mocks.cancelOtherPendingPaymentsForUser,
}))
vi.mock('@/lib/notifications', () => ({ notifyPaymentCanceled: mocks.notifyPaymentCanceled }))
vi.mock('@/lib/logger', () => ({ logWarn: mocks.logWarn, logError: mocks.logError }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    payment: { findFirst: mocks.paymentFindFirst, update: mocks.paymentUpdate },
    promoCodeRedemption: { updateMany: mocks.redemptionUpdateMany },
    $transaction: mocks.transaction,
  },
}))

import { POST } from './route'

const payment = {
  id: 'payment-1',
  userId: 'user-1',
  amountKopecks: 30000,
  status: 'PENDING',
  paidAt: null,
}

function callbackRequest(
  status: 'CONFIRMED' | 'CANCELED' | 'CHARGEBACKED' = 'CONFIRMED',
  overrides: Record<string, unknown> = {}
) {
  return new Request('https://cabinet.example/api/webhook/platega', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-MerchantId': 'merchant-id',
      'X-Secret': 'platega-secret',
    },
    body: JSON.stringify({
      id: 'transaction-1',
      amount: 300,
      currency: 'RUB',
      status,
      paymentMethod: 2,
      ...overrides,
    }),
  })
}

describe('Platega webhook', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.verifyHeaders.mockResolvedValue({ ok: true })
    mocks.paymentFindFirst.mockResolvedValue(payment)
    mocks.paymentUpdate.mockResolvedValue({})
    mocks.redemptionUpdateMany.mockResolvedValue({ count: 0 })
    mocks.transaction.mockImplementation(async (queries) => Promise.all(queries))
    mocks.syncPaymentProvisioning.mockResolvedValue({ ok: true, status: 'succeeded', provisioned: true })
    mocks.cancelOtherPendingPaymentsForUser.mockResolvedValue({ canceled: 0, paid: 0 })
  })

  it('rejects a callback with invalid credentials', async () => {
    mocks.verifyHeaders.mockResolvedValue({ ok: false, error: 'invalid_credentials' })

    const response = await POST(callbackRequest())

    expect(response.status).toBe(403)
    expect(mocks.paymentFindFirst).not.toHaveBeenCalled()
  })

  it('confirms the payment and starts idempotent provisioning', async () => {
    const response = await POST(callbackRequest())

    expect(response.status).toBe(200)
    expect(mocks.paymentUpdate).toHaveBeenCalledWith({
      where: { id: 'payment-1' },
      data: expect.objectContaining({
        status: 'SUCCEEDED',
        providerStatus: 'CONFIRMED',
        provisioningError: null,
      }),
    })
    expect(mocks.cancelOtherPendingPaymentsForUser).toHaveBeenCalledWith('user-1', 'payment-1')
    expect(mocks.syncPaymentProvisioning).toHaveBeenCalledWith({ paymentId: 'payment-1', userId: 'user-1' })
  })

  it('rejects a callback with a changed amount', async () => {
    const response = await POST(callbackRequest('CONFIRMED', { amount: 299.99 }))

    expect(response.status).toBe(409)
    expect(mocks.paymentUpdate).not.toHaveBeenCalled()
  })

  it('cancels only a pending payment', async () => {
    const response = await POST(callbackRequest('CANCELED'))

    expect(response.status).toBe(200)
    expect(mocks.paymentUpdate).toHaveBeenCalledWith({
      where: { id: 'payment-1' },
      data: { status: 'CANCELED', providerStatus: 'CANCELED' },
    })
    expect(mocks.notifyPaymentCanceled).toHaveBeenCalledWith('payment-1')
  })

  it('records a chargeback without issuing access again', async () => {
    const response = await POST(callbackRequest('CHARGEBACKED'))

    expect(response.status).toBe(200)
    expect(mocks.paymentUpdate).toHaveBeenCalledWith({
      where: { id: 'payment-1' },
      data: { status: 'REFUNDED', providerStatus: 'CHARGEBACKED' },
    })
    expect(mocks.syncPaymentProvisioning).not.toHaveBeenCalled()
  })
})
