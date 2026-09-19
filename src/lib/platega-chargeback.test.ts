import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  recordSucceededRefund: vi.fn(),
  terminateUserSubscription: vi.fn(),
  revokeDeviceLimitAddonForPayment: vi.fn(),
}))

vi.mock('./payment-refunds', () => ({ recordSucceededRefund: mocks.recordSucceededRefund }))
vi.mock('./subscription-termination', () => ({ terminateUserSubscription: mocks.terminateUserSubscription }))
vi.mock('./device-limit-addon', () => ({
  revokeDeviceLimitAddonForPayment: mocks.revokeDeviceLimitAddonForPayment,
}))

import { applyPlategaChargeback } from './platega-chargeback'

const baseInput = {
  paymentId: 'payment-1',
  userId: 'user-1',
  purchaseType: 'SUBSCRIPTION' as const,
  amountKopecks: 30_000,
  externalPaymentId: 'transaction-1',
}

describe('applyPlategaChargeback', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.recordSucceededRefund.mockResolvedValue({ fullyRefunded: true, refundedAmountKopecks: 30_000 })
    mocks.terminateUserSubscription.mockResolvedValue({ hadSubscription: true })
    mocks.revokeDeviceLimitAddonForPayment.mockResolvedValue({ revoked: true })
  })

  it('records the refund and terminates a subscription purchase', async () => {
    await applyPlategaChargeback(baseInput)

    expect(mocks.recordSucceededRefund).toHaveBeenCalledWith({
      paymentId: 'payment-1',
      providerRefundId: 'platega-chargeback:transaction-1',
      amountKopecks: 30_000,
      paymentAmountKopecks: 30_000,
      providerStatus: 'CHARGEBACKED',
    })
    expect(mocks.terminateUserSubscription).toHaveBeenCalledWith({
      userId: 'user-1',
      source: 'PLATEGA_CHARGEBACK',
      paymentId: 'payment-1',
    })
  })

  it('revokes a device add-on without terminating the subscription', async () => {
    await applyPlategaChargeback({ ...baseInput, purchaseType: 'DEVICE_LIMIT_ADDON' })

    expect(mocks.revokeDeviceLimitAddonForPayment).toHaveBeenCalledWith('payment-1')
    expect(mocks.terminateUserSubscription).not.toHaveBeenCalled()
  })

  it('relies on refund processing to revoke a whitelist add-on', async () => {
    await applyPlategaChargeback({ ...baseInput, purchaseType: 'WHITELIST_ADDON' })

    expect(mocks.revokeDeviceLimitAddonForPayment).not.toHaveBeenCalled()
    expect(mocks.terminateUserSubscription).not.toHaveBeenCalled()
  })
})
