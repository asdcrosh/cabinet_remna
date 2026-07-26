import type { Prisma, ReferralRewardTrigger } from '@prisma/client'
import { prisma } from './prisma'
import { remnawave } from './remnawave'
import { isFeatureEnabled } from './feature-flags'
import { getEffectiveReferralSettings, type ReferralSettings } from './referral-settings'
import { grantReferralBonusBoxAttemptsForReward } from './bonus-box'

const DEFAULT_REFERRAL_BONUS_DAYS = 7
export function getReferralBonusDays() {
  const raw = process.env.REFERRAL_BONUS_DAYS
  if (!raw) return DEFAULT_REFERRAL_BONUS_DAYS

  const parsed = Number.parseInt(raw, 10)
  if (!Number.isFinite(parsed) || parsed < 1 || parsed > 365) {
    return DEFAULT_REFERRAL_BONUS_DAYS
  }

  return parsed
}

export async function grantReferralRewardForRegistration(userId: string) {
  if (!await isFeatureEnabled('referrals')) {
    return { granted: false as const, reason: 'referrals_disabled' as const }
  }

  const settings = await getEffectiveReferralSettings()
  if (settings.trigger !== 'REGISTRATION') {
    return { granted: false as const, reason: 'wrong_trigger' as const }
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, referredById: true },
  })
  if (!user) return { granted: false as const, reason: 'user_not_found' as const }

  return createReferralReward({
    referredUserId: user.id,
    referrerId: user.referredById,
    trigger: 'REGISTRATION',
    triggeringPaymentId: null,
    settings,
  })
}

export async function grantReferralRewardForPayment(paymentId: string) {
  if (!await isFeatureEnabled('referrals')) {
    return { granted: false as const, reason: 'referrals_disabled' as const }
  }

  const settings = await getEffectiveReferralSettings()
  if (settings.trigger !== 'FIRST_PAYMENT') {
    return { granted: false as const, reason: 'wrong_trigger' as const }
  }

  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    select: {
      id: true,
      userId: true,
      amountKopecks: true,
      status: true,
      subscriptionProvisionedAt: true,
      user: { select: { referredById: true } },
    },
  })

  if (!payment) return { granted: false as const, reason: 'payment_not_found' as const }
  if (payment.status !== 'SUCCEEDED' || !payment.subscriptionProvisionedAt) {
    return { granted: false as const, reason: 'payment_not_provisioned' as const }
  }
  if (payment.amountKopecks <= 0) {
    return { granted: false as const, reason: 'free_payment' as const }
  }
  if (payment.amountKopecks < settings.minimumPaymentKopecks) {
    return { granted: false as const, reason: 'minimum_payment_not_reached' as const }
  }

  return createReferralReward({
    referredUserId: payment.userId,
    referrerId: payment.user.referredById,
    trigger: 'FIRST_PAYMENT',
    triggeringPaymentId: payment.id,
    settings,
  })
}

async function createReferralReward(input: {
  referredUserId: string
  referrerId: string | null
  trigger: ReferralRewardTrigger
  triggeringPaymentId: string | null
  settings: ReferralSettings
}) {
  if (!input.referrerId || input.referrerId === input.referredUserId) {
    return { granted: false as const, reason: 'no_referrer' as const }
  }

  const existing = await prisma.referralReward.findUnique({
    where: { referredUserId: input.referredUserId },
    select: { id: true },
  })
  if (existing) {
    return { granted: false as const, reason: 'already_rewarded' as const, rewardId: existing.id }
  }

  if (input.settings.maxRewardsPerReferrer > 0) {
    const rewardsCount = await prisma.referralReward.count({
      where: { referrerId: input.referrerId },
    })
    if (rewardsCount >= input.settings.maxRewardsPerReferrer) {
      return { granted: false as const, reason: 'referrer_limit_reached' as const }
    }
  }

  const reward = await prisma.referralReward.upsert({
    where: { referredUserId: input.referredUserId },
    create: {
      referrerId: input.referrerId,
      referredUserId: input.referredUserId,
      triggeringPaymentId: input.triggeringPaymentId,
      trigger: input.trigger,
      bonusDays: input.settings.referrerBonusDays,
      referredBonusDays: input.settings.referredBonusDays,
      referrerAttempts: input.settings.referrerAttempts,
      referredAttempts: input.settings.referredAttempts,
    },
    update: {},
    select: { id: true, referrerId: true, referredUserId: true, status: true },
  })

  await grantReferralBonusBoxAttemptsForReward(reward.id)
  await Promise.all([
    applyPendingReferralRewardsForUser(reward.referrerId),
    applyPendingReferralRewardsForUser(reward.referredUserId),
  ])

  return {
    granted: true as const,
    rewardId: reward.id,
    status: reward.status,
  }
}

export async function applyPendingReferralRewardsForUser(userId: string) {
  if (!await isFeatureEnabled('referrals')) return []

  const rewards = await prisma.referralReward.findMany({
    where: {
      status: 'PENDING',
      OR: [{ referrerId: userId }, { referredUserId: userId }],
    },
    orderBy: { createdAt: 'asc' },
    take: 20,
    select: { id: true },
  })

  const results = []
  for (const reward of rewards) {
    results.push(await applyReferralReward(reward.id))
  }
  return results
}

async function applyReferralReward(rewardId: string) {
  const claimed = await prisma.referralReward.updateMany({
    where: { id: rewardId, status: 'PENDING' },
    data: { status: 'PROCESSING', lastError: null },
  })
  if (claimed.count === 0) return { applied: false as const, reason: 'not_pending' as const }

  const reward = await prisma.referralReward.findUnique({
    where: { id: rewardId },
    include: {
      referrer: {
        include: {
          subscriptions: {
            where: activeSubscriptionFilter(),
            orderBy: { expireAt: 'desc' },
            take: 1,
          },
        },
      },
      referredUser: {
        include: {
          subscriptions: {
            where: activeSubscriptionFilter(),
            orderBy: { expireAt: 'desc' },
            take: 1,
          },
        },
      },
    },
  })

  if (!reward) return { applied: false as const, reason: 'reward_not_found' as const }

  const referrerResult = await applyDaysReward({
    rewardId: reward.id,
    side: 'referrer',
    bonusDays: reward.bonusDays,
    alreadyApplied: Boolean(reward.appliedAt),
    user: reward.referrer,
  })
  const referredResult = await applyDaysReward({
    rewardId: reward.id,
    side: 'referred',
    bonusDays: reward.referredBonusDays,
    alreadyApplied: Boolean(reward.referredAppliedAt),
    user: reward.referredUser,
  })
  const applied = referrerResult.done && referredResult.done
  const lastError = [referrerResult.error, referredResult.error].filter(Boolean).join('; ') || null

  await prisma.referralReward.update({
    where: { id: reward.id },
    data: {
      status: applied ? 'APPLIED' : 'PENDING',
      lastError: lastError?.slice(0, 1000) ?? null,
    },
  })

  return applied
    ? { applied: true as const, rewardId: reward.id }
    : { applied: false as const, reason: 'recipient_has_no_active_subscription' as const, error: lastError }
}

async function applyDaysReward(input: {
  rewardId: string
  side: 'referrer' | 'referred'
  bonusDays: number
  alreadyApplied: boolean
  user: {
    remnawaveUuid: string | null
    subscriptions: Array<{ id: string; expireAt: Date }>
  }
}) {
  if (input.bonusDays <= 0 || input.alreadyApplied) return { done: true, error: null }

  const subscription = input.user.subscriptions[0]
  if (!subscription || !input.user.remnawaveUuid) {
    return { done: false, error: null }
  }

  const base = subscription.expireAt.getTime() > Date.now() ? subscription.expireAt : new Date()
  const newExpireAt = new Date(base.getTime() + input.bonusDays * 24 * 60 * 60 * 1000)

  try {
    const updated = await remnawave.updateUser({
      uuid: input.user.remnawaveUuid,
      expireAt: newExpireAt.toISOString(),
      status: 'ACTIVE',
    })
    const remoteExpireAt = new Date(updated.response.expireAt)
    const appliedAt = new Date()
    const rewardData = input.side === 'referrer'
      ? {
          appliedSubscriptionId: subscription.id,
          appliedAt,
        }
      : {
          referredAppliedSubscriptionId: subscription.id,
          referredAppliedAt: appliedAt,
        }

    await prisma.$transaction([
      prisma.subscription.update({
        where: { id: subscription.id },
        data: {
          expireAt: remoteExpireAt,
          status: 'ACTIVE',
          lastSyncedAt: new Date(),
          pendingSync: false,
        },
      }),
      prisma.referralReward.update({
        where: { id: input.rewardId },
        data: rewardData,
      }),
    ])

    return { done: true, error: null }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'referral reward failed'
    return { done: false, error: `${input.side}: ${message}` }
  }
}

function activeSubscriptionFilter(): Prisma.SubscriptionWhereInput {
  return {
    status: { in: ['ACTIVE', 'LIMITED'] },
    expireAt: { gt: new Date() },
  }
}
