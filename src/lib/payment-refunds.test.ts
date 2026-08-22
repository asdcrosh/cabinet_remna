import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  paymentRefund: {
    upsert: vi.fn(),
    aggregate: vi.fn(),
  },
  payment: { update: vi.fn() },
  promoCodeRedemption: { updateMany: vi.fn() },
  transaction: vi.fn(),
  revokeWhitelistAddonForPayment: vi.fn(),
}))

vi.mock('./prisma', () => ({
  prisma: {
    $transaction: mocks.transaction,
  },
}))
vi.mock('./whitelist-addon', () => ({
  revokeWhitelistAddonForPayment: mocks.revokeWhitelistAddonForPayment,
}))

import { recordSucceededRefund } from './payment-refunds'

describe('recordSucceededRefund', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.transaction.mockImplementation(async (callback) => callback({
      paymentRefund: mocks.paymentRefund,
      payment: mocks.payment,
      promoCodeRedemption: mocks.promoCodeRedemption,
    }))
    mocks.paymentRefund.upsert.mockResolvedValue({})
    mocks.payment.update.mockResolvedValue({})
    mocks.promoCodeRedemption.updateMany.mockResolvedValue({ count: 1 })
    mocks.revokeWhitelistAddonForPayment.mockResolvedValue({ revoked: false })
  })

  it('keeps payment active while total refunds are partial', async () => {
    mocks.paymentRefund.aggregate.mockResolvedValue({ _sum: { amountKopecks: 10000 } })

    const result = await recordSucceededRefund({
      paymentId: 'payment-1',
      providerRefundId: 'refund-1',
      amountKopecks: 10000,
      paymentAmountKopecks: 30000,
      providerStatus: 'refund.succeeded',
    })

    expect(result).toEqual({ fullyRefunded: false, refundedAmountKopecks: 10000 })
    expect(mocks.payment.update).not.toHaveBeenCalled()
  })

  it('marks payment refunded after cumulative refund reaches full amount', async () => {
    mocks.paymentRefund.aggregate.mockResolvedValue({ _sum: { amountKopecks: 30000 } })

    const result = await recordSucceededRefund({
      paymentId: 'payment-1',
      providerRefundId: 'refund-2',
      amountKopecks: 20000,
      paymentAmountKopecks: 30000,
      providerStatus: 'refund.succeeded',
    })

    expect(result.fullyRefunded).toBe(true)
    expect(mocks.payment.update).toHaveBeenCalledWith({
      where: { id: 'payment-1' },
      data: { status: 'REFUNDED', providerStatus: 'refund.succeeded' },
    })
    expect(mocks.promoCodeRedemption.updateMany).toHaveBeenCalledWith({
      where: {
        paymentId: 'payment-1',
        status: { in: ['PENDING', 'SUCCEEDED'] },
      },
      data: { status: 'CANCELED' },
    })
    expect(mocks.revokeWhitelistAddonForPayment).toHaveBeenCalledWith('payment-1')
  })
})
