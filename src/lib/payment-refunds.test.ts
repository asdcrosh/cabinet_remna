import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  paymentRefund: {
    upsert: vi.fn(),
    aggregate: vi.fn(),
  },
  payment: { update: vi.fn() },
  promoCodeRedemption: { updateMany: vi.fn() },
  bonusBoxAttempt: { count: vi.fn(), deleteMany: vi.fn() },
  referralReward: { findUnique: vi.fn(), delete: vi.fn(), update: vi.fn() },
  transaction: vi.fn(),
  revokeWhitelistAddonForPayment: vi.fn(),
}))

vi.mock('./prisma', () => ({
  prisma: {
    $transaction: mocks.transaction,
    bonusBoxAttempt: mocks.bonusBoxAttempt,
    referralReward: mocks.referralReward,
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
    mocks.bonusBoxAttempt.count.mockResolvedValue(0)
    mocks.bonusBoxAttempt.deleteMany.mockResolvedValue({ count: 0 })
    mocks.referralReward.findUnique.mockResolvedValue(null)
    mocks.referralReward.delete.mockResolvedValue({})
    mocks.referralReward.update.mockResolvedValue({})
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

  it('removes unused payment and referral attempts after a full refund', async () => {
    mocks.paymentRefund.aggregate.mockResolvedValue({ _sum: { amountKopecks: 30000 } })
    mocks.bonusBoxAttempt.deleteMany
      .mockResolvedValueOnce({ count: 2 })
      .mockResolvedValueOnce({ count: 3 })
    mocks.referralReward.findUnique.mockResolvedValue({
      id: 'reward-1',
      appliedAt: null,
      referredAppliedAt: null,
    })

    await recordSucceededRefund({
      paymentId: 'payment-1',
      providerRefundId: 'refund-benefits',
      amountKopecks: 30000,
      paymentAmountKopecks: 30000,
      providerStatus: 'refund.succeeded',
    })

    expect(mocks.bonusBoxAttempt.deleteMany).toHaveBeenCalledWith({
      where: {
        source: 'PAYMENT',
        sourceKey: { startsWith: 'payment-1:' },
        usedAt: null,
      },
    })
    expect(mocks.referralReward.delete).toHaveBeenCalledWith({ where: { id: 'reward-1' } })
  })

  it('marks applied referral benefits for review instead of shortening newer access', async () => {
    mocks.paymentRefund.aggregate.mockResolvedValue({ _sum: { amountKopecks: 30000 } })
    mocks.referralReward.findUnique.mockResolvedValue({
      id: 'reward-1',
      appliedAt: new Date('2026-08-02T00:00:00.000Z'),
      referredAppliedAt: null,
    })

    await recordSucceededRefund({
      paymentId: 'payment-1',
      providerRefundId: 'refund-applied-reward',
      amountKopecks: 30000,
      paymentAmountKopecks: 30000,
      providerStatus: 'refund.succeeded',
    })

    expect(mocks.referralReward.delete).not.toHaveBeenCalled()
    expect(mocks.referralReward.update).toHaveBeenCalledWith({
      where: { id: 'reward-1' },
      data: {
        lastError: 'Платёж-триггер возвращён; применённые дни или использованные призы требуют ручной сверки.',
      },
    })
  })
})
