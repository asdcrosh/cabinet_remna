import { notifyWhitelistAddonExpiring } from './notifications'
import { prisma } from './prisma'

const DAY_MS = 24 * 60 * 60 * 1000

export async function reconcileWhitelistAddonExpiryNotifications(options?: {
  now?: Date
  batchSize?: number
  shouldStop?: () => boolean
}) {
  const now = options?.now ?? new Date()
  const subscriptions = await prisma.subscription.findMany({
    where: {
      whitelistAddonActive: true,
      whitelistAddonExpireAt: {
        gt: now,
        lte: new Date(now.getTime() + 3 * DAY_MS),
      },
    },
    orderBy: { whitelistAddonExpireAt: 'asc' },
    take: options?.batchSize ?? 100,
    select: {
      id: true,
      userId: true,
      whitelistAddonExpireAt: true,
    },
  })

  let sent = 0
  for (const subscription of subscriptions) {
    if (options?.shouldStop?.()) break
    if (!subscription.whitelistAddonExpireAt) continue
    await notifyWhitelistAddonExpiring({
      userId: subscription.userId,
      subscriptionId: subscription.id,
      expireAt: subscription.whitelistAddonExpireAt,
    })
    sent += 1
  }

  return { checked: subscriptions.length, sent }
}
