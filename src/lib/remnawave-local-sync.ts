import type { UserResponse } from './remnawave'
import { prisma } from './prisma'

export async function upsertLocalSubscriptionFromRemnawave(input: {
  localUserId: string
  remnashopUserId?: number | null
  remnawaveUser: UserResponse
}) {
  const trafficLimit = BigInt(input.remnawaveUser.trafficLimitBytes || '0')
  const remnawaveCreatedAt = new Date(input.remnawaveUser.createdAt)
  const startAt = Number.isNaN(remnawaveCreatedAt.getTime()) ? new Date() : remnawaveCreatedAt

  await prisma.user.update({
    where: { id: input.localUserId },
    data: {
      ...(input.remnashopUserId ? { remnashopUserId: input.remnashopUserId } : {}),
      remnashopSyncedAt: input.remnashopUserId ? new Date() : undefined,
      remnawaveUuid: input.remnawaveUser.uuid,
      remnawaveShortUuid: input.remnawaveUser.shortUuid,
      remnawaveUsername: input.remnawaveUser.username,
    },
  })

  const existing = await prisma.subscription.findFirst({
    where: { userId: input.localUserId },
    orderBy: { expireAt: 'desc' },
  })

  const data = {
    expireAt: new Date(input.remnawaveUser.expireAt),
    status: mapRemnawaveStatus(input.remnawaveUser.status),
    trafficLimitBytes: trafficLimit === 0n ? null : trafficLimit,
    trafficUsedBytes: BigInt(input.remnawaveUser.usedTrafficBytes || '0'),
    lifetimeUsedBytes: BigInt(input.remnawaveUser.lifetimeUsedTrafficBytes || '0'),
    lastSyncedAt: new Date(),
    pendingSync: false,
  }

  if (existing) {
    return prisma.subscription.update({
      where: { id: existing.id },
      data,
    })
  }

  return prisma.subscription.create({
    data: {
      userId: input.localUserId,
      startAt,
      ...data,
    },
  })
}

export function mapRemnawaveStatus(status: UserResponse['status']) {
  switch (status) {
    case 'ACTIVE':
      return 'ACTIVE' as const
    case 'LIMITED':
      return 'LIMITED' as const
    case 'EXPIRED':
      return 'EXPIRED' as const
    case 'DISABLED':
      return 'DISABLED' as const
  }
}
