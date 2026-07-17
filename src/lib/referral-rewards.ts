import { prisma } from './prisma'
import { remnawave } from './remnawave'
import { isFeatureEnabled } from './feature-flags'

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

export async function grantReferralRewardForPayment(paymentId: string) {
  if (!await isFeatureEnabled('referrals')) {
    return { granted: false as const, reason: 'referrals_disabled' as const }
  }

  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    select: {
      id: true,
      userId: true,
      amountKopecks: true,
      status: true,
      subscriptionProvisionedAt: true,
      user: {
        select: {
          referredById: true,
        },
      },
    },
  })

  if (!payment) return { granted: false as const, reason: 'payment_not_found' as const }
  if (payment.status !== 'SUCCEEDED' || !payment.subscriptionProvisionedAt) {
    return { granted: false as const, reason: 'payment_not_provisioned' as const }
  }
  if (payment.amountKopecks <= 0) {
    return { granted: false as const, reason: 'free_payment' as const }
  }
  if (!payment.user.referredById || payment.user.referredById === payment.userId) {
    return { granted: false as const, reason: 'no_referrer' as const }
  }

  const reward = await prisma.referralReward.upsert({
    where: { referredUserId: payment.userId },
    create: {
      referrerId: payment.user.referredById,
      referredUserId: payment.userId,
      triggeringPaymentId: payment.id,
      bonusDays: getReferralBonusDays(),
    },
    update: {},
    select: { id: true, referrerId: true, status: true },
  })

  await applyPendingReferralRewardsForUser(reward.referrerId)

  return {
    granted: reward.status === 'APPLIED' ? false as const : true as const,
    rewardId: reward.id,
    status: reward.status,
  }
}

export async function applyPendingReferralRewardsForUser(referrerId: string) {
  if (!await isFeatureEnabled('referrals')) return []

  const rewards = await prisma.referralReward.findMany({
    where: { referrerId, status: 'PENDING' },
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
            where: {
              status: { in: ['ACTIVE', 'LIMITED'] },
              expireAt: { gt: new Date() },
            },
            orderBy: { expireAt: 'desc' },
            take: 1,
          },
        },
      },
    },
  })

  if (!reward) return { applied: false as const, reason: 'reward_not_found' as const }

  const subscription = reward.referrer.subscriptions[0]
  if (!subscription || !reward.referrer.remnawaveUuid) {
    await prisma.referralReward.update({
      where: { id: reward.id },
      data: { status: 'PENDING' },
    })
    return { applied: false as const, reason: 'referrer_has_no_active_subscription' as const }
  }

  const base = subscription.expireAt.getTime() > Date.now() ? subscription.expireAt : new Date()
  const newExpireAt = new Date(base.getTime() + reward.bonusDays * 24 * 60 * 60 * 1000)

  try {
    const updated = await remnawave.updateUser({
      uuid: reward.referrer.remnawaveUuid,
      expireAt: newExpireAt.toISOString(),
      status: 'ACTIVE',
    })
    const remoteExpireAt = new Date(updated.response.expireAt)

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
        where: { id: reward.id },
        data: {
          status: 'APPLIED',
          appliedSubscriptionId: subscription.id,
          appliedAt: new Date(),
          lastError: null,
        },
      }),
    ])

    return { applied: true as const, rewardId: reward.id, subscriptionId: subscription.id }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'referral reward failed'
    await prisma.referralReward.update({
      where: { id: reward.id },
      data: { status: 'PENDING', lastError: message.slice(0, 1000) },
    })
    return { applied: false as const, reason: 'apply_failed' as const, error: message }
  }
}
