import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  paymentFindUnique: vi.fn(),
  userFindUnique: vi.fn(),
  referralSettingFindUnique: vi.fn(),
  referralRewardFindUnique: vi.fn(),
  referralRewardFindMany: vi.fn(),
  referralRewardUpsert: vi.fn(),
  referralRewardCount: vi.fn(),
  referralRewardUpdateMany: vi.fn(),
  referralRewardUpdate: vi.fn(),
  subscriptionUpdate: vi.fn(),
  transaction: vi.fn(),
  remnawaveUpdateUser: vi.fn(),
  grantReferralAttempts: vi.fn(),
}))

vi.mock('./prisma', () => ({
  prisma: {
    payment: { findUnique: mocks.paymentFindUnique },
    user: { findUnique: mocks.userFindUnique },
    referralSetting: { findUnique: mocks.referralSettingFindUnique },
    referralReward: {
      findUnique: mocks.referralRewardFindUnique,
      findMany: mocks.referralRewardFindMany,
      upsert: mocks.referralRewardUpsert,
      count: mocks.referralRewardCount,
      updateMany: mocks.referralRewardUpdateMany,
      update: mocks.referralRewardUpdate,
    },
    subscription: { update: mocks.subscriptionUpdate },
    $transaction: mocks.transaction,
  },
}))

vi.mock('./remnawave', () => ({
  remnawave: { updateUser: mocks.remnawaveUpdateUser },
}))
vi.mock('./feature-flags', () => ({ isFeatureEnabled: vi.fn(async () => true) }))
vi.mock('./bonus-box', () => ({
  grantReferralBonusBoxAttemptsForReward: mocks.grantReferralAttempts,
}))

import {
  getReferralBonusDays,
  grantReferralRewardForPayment,
  grantReferralRewardForRegistration,
} from './referral-rewards'

const defaultSettings = {
  id: 'default',
  trigger: 'FIRST_PAYMENT',
  minimumPaymentKopecks: 0,
  maxRewardsPerReferrer: 0,
  referrerBonusDays: 7,
  referredBonusDays: 3,
  referrerAttempts: 2,
  referredAttempts: 1,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
}

describe('referral rewards', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env.REFERRAL_BONUS_DAYS
    mocks.referralSettingFindUnique.mockResolvedValue(defaultSettings)
    mocks.referralRewardFindUnique.mockResolvedValue(null)
    mocks.referralRewardFindMany.mockResolvedValue([])
    mocks.referralRewardCount.mockResolvedValue(0)
    mocks.transaction.mockImplementation(async (operations) => Promise.all(operations))
    mocks.grantReferralAttempts.mockResolvedValue({ granted: 3 })
  })

  it('keeps the legacy environment fallback inside the allowed range', () => {
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

  it('checks the configured minimum first payment amount', async () => {
    mocks.referralSettingFindUnique.mockResolvedValue({
      ...defaultSettings,
      minimumPaymentKopecks: 50_000,
    })
    mocks.paymentFindUnique.mockResolvedValue({
      id: 'payment-1',
      userId: 'user-1',
      amountKopecks: 30_000,
      status: 'SUCCEEDED',
      subscriptionProvisionedAt: new Date('2026-01-02T00:00:00.000Z'),
      user: { referredById: 'referrer-1' },
    })

    await expect(grantReferralRewardForPayment('payment-1')).resolves.toEqual({
      granted: false,
      reason: 'minimum_payment_not_reached',
    })
  })

  it('snapshots rewards for both users on the first paid payment', async () => {
    mocks.paymentFindUnique.mockResolvedValue({
      id: 'payment-1',
      userId: 'user-1',
      amountKopecks: 30_000,
      status: 'SUCCEEDED',
      subscriptionProvisionedAt: new Date('2026-01-02T00:00:00.000Z'),
      user: { referredById: 'referrer-1' },
    })
    mocks.referralRewardUpsert.mockResolvedValue({
      id: 'reward-1',
      referrerId: 'referrer-1',
      referredUserId: 'user-1',
      status: 'PENDING',
    })

    await expect(grantReferralRewardForPayment('payment-1')).resolves.toEqual({
      granted: true,
      rewardId: 'reward-1',
      status: 'PENDING',
    })
    expect(mocks.referralRewardUpsert).toHaveBeenCalledWith({
      where: { referredUserId: 'user-1' },
      create: expect.objectContaining({
        referrerId: 'referrer-1',
        referredUserId: 'user-1',
        triggeringPaymentId: 'payment-1',
        trigger: 'FIRST_PAYMENT',
        bonusDays: 7,
        referredBonusDays: 3,
        referrerAttempts: 2,
        referredAttempts: 1,
      }),
      update: {},
      select: expect.any(Object),
    })
    expect(mocks.grantReferralAttempts).toHaveBeenCalledWith('reward-1')
  })

  it('can create the reward immediately after invited registration', async () => {
    mocks.referralSettingFindUnique.mockResolvedValue({
      ...defaultSettings,
      trigger: 'REGISTRATION',
    })
    mocks.userFindUnique.mockResolvedValue({
      id: 'user-1',
      referredById: 'referrer-1',
    })
    mocks.referralRewardUpsert.mockResolvedValue({
      id: 'reward-1',
      referrerId: 'referrer-1',
      referredUserId: 'user-1',
      status: 'PENDING',
    })

    await expect(grantReferralRewardForRegistration('user-1')).resolves.toEqual({
      granted: true,
      rewardId: 'reward-1',
      status: 'PENDING',
    })
    expect(mocks.referralRewardUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          trigger: 'REGISTRATION',
          triggeringPaymentId: null,
        }),
      })
    )
  })

  it('stops creating rewards after the configured inviter limit', async () => {
    mocks.referralSettingFindUnique.mockResolvedValue({
      ...defaultSettings,
      maxRewardsPerReferrer: 2,
    })
    mocks.referralRewardCount.mockResolvedValue(2)
    mocks.paymentFindUnique.mockResolvedValue({
      id: 'payment-1',
      userId: 'user-1',
      amountKopecks: 30_000,
      status: 'SUCCEEDED',
      subscriptionProvisionedAt: new Date('2026-01-02T00:00:00.000Z'),
      user: { referredById: 'referrer-1' },
    })

    await expect(grantReferralRewardForPayment('payment-1')).resolves.toEqual({
      granted: false,
      reason: 'referrer_limit_reached',
    })
    expect(mocks.referralRewardUpsert).not.toHaveBeenCalled()
  })
})
