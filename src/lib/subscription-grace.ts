import { prisma } from './prisma'
import { hasRemnawaveUserReference, remnawave, remnawaveUserReference } from './remnawave'
import { logError } from './logger'

export const SUBSCRIPTION_GRACE_HOURS = 24
const GRACE_MS = SUBSCRIPTION_GRACE_HOURS * 60 * 60 * 1000

export async function reconcileSubscriptionGracePeriods(options?: { now?: Date; limit?: number }) {
  const now = options?.now ?? new Date()
  const limit = options?.limit ?? 100
  const candidates = await prisma.subscription.findMany({
    where: {
      graceExpireAt: null,
      expireAt: { gt: new Date(now.getTime() - GRACE_MS), lte: now },
      status: { in: ['ACTIVE', 'LIMITED', 'EXPIRED'] },
    },
    orderBy: { expireAt: 'asc' },
    take: limit,
    include: { user: true },
  })
  let started = 0
  let failed = 0
  for (const subscription of candidates) {
    const graceExpireAt = new Date(subscription.expireAt.getTime() + GRACE_MS)
    if (graceExpireAt <= now) continue
    try {
      if (hasRemnawaveUserReference(subscription.user)) {
        await remnawave.updateUser(remnawaveUserReference(subscription.user), {
          expireAt: graceExpireAt.toISOString(),
          status: 'ACTIVE',
        })
      }
      await prisma.subscription.update({
        where: { id: subscription.id },
        data: { graceStartedAt: now, graceExpireAt, status: 'LIMITED' },
      })
      await prisma.auditLog.create({
        data: {
          targetId: subscription.userId,
          action: 'ADMIN_FEATURES_UPDATED',
          message: 'Начался 24-часовой льготный период',
          metadata: { subscriptionId: subscription.id, graceExpireAt: graceExpireAt.toISOString() },
        },
      })
      started += 1
    } catch (error) {
      failed += 1
      logError('subscription_grace.start_failed', error, { subscriptionId: subscription.id })
    }
  }

  const ending = await prisma.subscription.findMany({
    where: {
      graceExpireAt: { lte: now },
      status: { not: 'EXPIRED' },
    },
    select: { id: true, userId: true },
    take: limit,
  })
  const expired = await prisma.subscription.updateMany({
    where: {
      id: { in: ending.map((subscription) => subscription.id) },
      status: { not: 'EXPIRED' },
    },
    data: { status: 'EXPIRED' },
  })
  if (ending.length > 0) {
    await prisma.auditLog.createMany({
      data: ending.map((subscription) => ({
        targetId: subscription.userId,
        action: 'ADMIN_FEATURES_UPDATED' as const,
        message: 'Льготный период завершён',
        metadata: { subscriptionId: subscription.id },
      })),
    })
  }
  return { checked: candidates.length, started, expired: expired.count, failed }
}
