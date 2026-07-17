import { notifySubscriptionExpiring } from './notifications'
import { prisma } from './prisma'

const DAY_MS = 24 * 60 * 60 * 1000

export async function reconcileSubscriptionExpiryNotifications(options?: {
  now?: Date
  batchSize?: number
  shouldStop?: () => boolean
}) {
  const now = options?.now ?? new Date()
  const nowMs = now.getTime()
  const batchSize = options?.batchSize ?? 100
  const shouldStop = options?.shouldStop ?? (() => false)
  const select = {
    id: true,
    userId: true,
    expireAt: true,
    plan: { select: { name: true } },
  } as const

  const [upcoming, expired] = await Promise.all([
    prisma.subscription.findMany({
      where: {
        status: { in: ['ACTIVE', 'LIMITED'] },
        expireAt: {
          gt: now,
          lte: new Date(nowMs + 3 * DAY_MS),
        },
      },
      orderBy: { expireAt: 'asc' },
      take: batchSize,
      select,
    }),
    prisma.subscription.findMany({
      where: {
        status: { in: ['ACTIVE', 'LIMITED', 'EXPIRED'] },
        expireAt: {
          gt: new Date(nowMs - DAY_MS),
          lte: now,
        },
      },
      orderBy: { expireAt: 'desc' },
      take: batchSize,
      select,
    }),
  ])

  let sent = 0
  for (const subscription of upcoming) {
    if (shouldStop()) break
    const leftMs = subscription.expireAt.getTime() - nowMs
    await notifySubscriptionExpiring({
      userId: subscription.userId,
      subscriptionId: subscription.id,
      expireAt: subscription.expireAt,
      stage: leftMs <= DAY_MS ? '1d' : '3d',
      planName: subscription.plan?.name,
    })
    sent += 1
  }

  for (const subscription of expired) {
    if (shouldStop()) break
    await notifySubscriptionExpiring({
      userId: subscription.userId,
      subscriptionId: subscription.id,
      expireAt: subscription.expireAt,
      stage: 'expired',
      planName: subscription.plan?.name,
    })
    sent += 1
  }

  return { checked: upcoming.length + expired.length, sent }
}
