import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  paymentFindUnique: vi.fn(),
  referralRewardUpsert: vi.fn(),
  referralRewardFindMany: vi.fn(),
  referralRewardUpdateMany: vi.fn(),
  referralRewardFindUnique: vi.fn(),
  referralRewardUpdate: vi.fn(),
  subscriptionUpdate: vi.fn(),
  transaction: vi.fn(),
  remnawaveUpdateUser: vi.fn(),
}))

vi.mock('./prisma', () => ({
  prisma: {
    payment: { findUnique: mocks.paymentFindUnique },
    referralReward: {
      upsert: mocks.referralRewardUpsert,
      findMany: mocks.referralRewardFindMany,
      updateMany: mocks.referralRewardUpdateMany,
      findUnique: mocks.referralRewardFindUnique,
      update: mocks.referralRewardUpdate,
    },
    subscription: { update: mocks.subscriptionUpdate },
    $transaction: mocks.transaction,
  },
}))

vi.mock('./remnawave', () => ({
  remnawave: { updateUser: mocks.remnawaveUpdateUser },
}))

import { getReferralBonusDays, grantReferralRewardForPayment } from './referral-rewards'

describe('referral rewards', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env.REFERRAL_BONUS_DAYS
    mocks.referralRewardFindMany.mockResolvedValue([])
    mocks.transaction.mockImplementation(async (operations) => Promise.all(operations))
  })

  it('uses the configured bonus days only inside the allowed range', () => {
    process.env.REFERRAL_BONUS_DAYS = '14'
    expect(getReferralBonusDays()).toBe(14)

    process.env.REFERRAL_BONUS_DAYS = '999'
    expect(getReferralBonusDays()).toBe(7)
  })

  it('does not grant rewards before a paid payment is provisioned', async () => {
    mocks.paymentFindUnique.mockResolvedValue({
      id: 'payment-1',
      userId: 'user-1',
      amountKopecks: 30000,
      status: 'SUCCEEDED',
      subscriptionProvisionedAt: null,
      user: { referredById: 'referrer-1' },
    })

    await expect(grantReferralRewardForPayment('payment-1')).resolves.toEqual({
      granted: false,
      reason: 'payment_not_provisioned',
    })
    expect(mocks.referralRewardUpsert).not.toHaveBeenCalled()
  })

  it('creates one pending reward for the first paid provisioned payment', async () => {
    mocks.paymentFindUnique.mockResolvedValue({
      id: 'payment-1',
      userId: 'user-1',
      amountKopecks: 30000,
      status: 'SUCCEEDED',
      subscriptionProvisionedAt: new Date('2026-01-02T00:00:00.000Z'),
      user: { referredById: 'referrer-1' },
    })
    mocks.referralRewardUpsert.mockResolvedValue({
      id: 'reward-1',
      referrerId: 'referrer-1',
      status: 'PENDING',
    })

    await expect(grantReferralRewardForPayment('payment-1')).resolves.toEqual({
      granted: true,
      rewardId: 'reward-1',
      status: 'PENDING',
    })
    expect(mocks.referralRewardUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { referredUserId: 'user-1' },
        create: expect.objectContaining({
          referrerId: 'referrer-1',
          referredUserId: 'user-1',
          triggeringPaymentId: 'payment-1',
          bonusDays: 7,
        }),
      })
    )
  })
})
