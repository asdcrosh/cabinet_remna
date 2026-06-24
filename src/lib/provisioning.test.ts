import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const subscription = { id: 'sub-1' }
  const prisma = {
    payment: {
      findUnique: vi.fn(),
    },
    provisioningJob: {
      upsert: vi.fn(),
      update: vi.fn(),
    },
  }

  const ensureRemnawaveSubscription = vi.fn()
  const grantReferralRewardForPayment = vi.fn()
  const applyPendingReferralRewardsForUser = vi.fn()
  const grantPaymentBonusBoxAttempts = vi.fn()
  const grantReferralBonusBoxAttemptsForPayment = vi.fn()

  return {
    prisma,
    ensureRemnawaveSubscription,
    grantReferralRewardForPayment,
    applyPendingReferralRewardsForUser,
    grantPaymentBonusBoxAttempts,
    grantReferralBonusBoxAttemptsForPayment,
    subscription,
  }
})

vi.mock('./prisma', () => ({ prisma: mocks.prisma }))
vi.mock('./subscription', () => ({
  ensureRemnawaveSubscription: mocks.ensureRemnawaveSubscription,
}))
vi.mock('./referral-rewards', () => ({
  grantReferralRewardForPayment: mocks.grantReferralRewardForPayment,
  applyPendingReferralRewardsForUser: mocks.applyPendingReferralRewardsForUser,
}))
vi.mock('./bonus-box', () => ({
  grantPaymentBonusBoxAttempts: mocks.grantPaymentBonusBoxAttempts,
  grantReferralBonusBoxAttemptsForPayment: mocks.grantReferralBonusBoxAttemptsForPayment,
}))

import { provisionPaymentSubscription } from './provisioning'

const plan = {
  id: 'plan-1',
  name: 'Базовый',
  durationDays: 30,
  trafficLimitGb: 200,
  deviceLimit: 5,
}

const input = {
  userId: 'user-1',
  email: 'user@example.com',
  paymentId: 'pay-1',
  plan,
}

describe('provisionPaymentSubscription', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('short-circuits and marks job succeeded when payment is already provisioned', async () => {
    mocks.prisma.payment.findUnique.mockResolvedValue({
      id: 'pay-1',
      subscriptionProvisionedAt: new Date(),
      subscription: mocks.subscription,
      provisioningJob: null,
    })

    const result = await provisionPaymentSubscription(input)

    expect(result.idempotent).toBe(true)
    expect(result.subscription).toBe(mocks.subscription)
    expect(mocks.prisma.provisioningJob.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { paymentId: 'pay-1' },
        update: expect.objectContaining({ status: 'SUCCEEDED' }),
      })
    )
    expect(mocks.ensureRemnawaveSubscription).not.toHaveBeenCalled()
    expect(mocks.grantPaymentBonusBoxAttempts).toHaveBeenCalledWith('pay-1')
    expect(mocks.grantReferralRewardForPayment).toHaveBeenCalledWith('pay-1')
    expect(mocks.grantReferralBonusBoxAttemptsForPayment).toHaveBeenCalledWith('pay-1')
    expect(mocks.applyPendingReferralRewardsForUser).toHaveBeenCalledWith('user-1')
  })

  it('creates a running job and marks it succeeded after provisioning', async () => {
    mocks.prisma.payment.findUnique.mockResolvedValue({
      id: 'pay-1',
      subscriptionProvisionedAt: null,
      subscription: null,
      provisioningJob: null,
    })
    mocks.prisma.provisioningJob.upsert.mockResolvedValue({ id: 'job-1', attempts: 1 })
    mocks.ensureRemnawaveSubscription.mockResolvedValue({
      subscription: mocks.subscription,
      remnawaveUser: null,
      isNew: true,
      idempotent: false,
    })

    const result = await provisionPaymentSubscription(input)

    expect(result.jobStatus).toBe('SUCCEEDED')
    expect(mocks.prisma.provisioningJob.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ status: 'RUNNING', attempts: 1 }),
        update: expect.objectContaining({ status: 'RUNNING', attempts: { increment: 1 } }),
      })
    )
    expect(mocks.prisma.provisioningJob.update).toHaveBeenCalledWith({
      where: { id: 'job-1' },
      data: expect.objectContaining({ status: 'SUCCEEDED', lastError: null }),
    })
    expect(mocks.grantPaymentBonusBoxAttempts).toHaveBeenCalledWith('pay-1')
    expect(mocks.grantReferralRewardForPayment).toHaveBeenCalledWith('pay-1')
    expect(mocks.grantReferralBonusBoxAttemptsForPayment).toHaveBeenCalledWith('pay-1')
    expect(mocks.applyPendingReferralRewardsForUser).toHaveBeenCalledWith('user-1')
  })

  it('marks job failed and schedules retry when provisioning throws', async () => {
    mocks.prisma.payment.findUnique.mockResolvedValue({
      id: 'pay-1',
      subscriptionProvisionedAt: null,
      subscription: null,
      provisioningJob: null,
    })
    mocks.prisma.provisioningJob.upsert.mockResolvedValue({ id: 'job-1', attempts: 2 })
    mocks.ensureRemnawaveSubscription.mockRejectedValue(new Error('Remnawave timeout'))

    await expect(provisionPaymentSubscription(input)).rejects.toThrow('Remnawave timeout')

    expect(mocks.prisma.provisioningJob.update).toHaveBeenCalledWith({
      where: { id: 'job-1' },
      data: expect.objectContaining({
        status: 'FAILED',
        lastError: 'Remnawave timeout',
        nextRetryAt: new Date('2026-01-01T00:04:00.000Z'),
      }),
    })
    expect(mocks.grantReferralRewardForPayment).not.toHaveBeenCalled()
    expect(mocks.grantPaymentBonusBoxAttempts).not.toHaveBeenCalled()
    expect(mocks.grantReferralBonusBoxAttemptsForPayment).not.toHaveBeenCalled()
  })
})
