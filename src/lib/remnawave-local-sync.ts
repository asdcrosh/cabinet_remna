import type { UserResponse } from './remnawave'
import { prisma } from './prisma'
import { readRemnawaveBigInt } from './remnawave-usage'

export async function upsertLocalSubscriptionFromRemnawave(input: {
  localUserId: string
  remnashopUserId?: number | null
  planId?: string | null
  startAt?: Date | null
  remnawaveUser: UserResponse
}) {
  const trafficLimit = readRemnawaveBigInt(input.remnawaveUser, ['trafficLimitBytes', 'trafficLimit'])
  const trafficUsed = readRemnawaveBigInt(input.remnawaveUser, ['usedTrafficBytes', 'trafficUsedBytes'])
  const lifetimeUsed = readRemnawaveBigInt(input.remnawaveUser, [
    'lifetimeUsedTrafficBytes',
    'lifetimeTrafficUsedBytes',
  ])
  const remnawaveCreatedAt = new Date(input.remnawaveUser.createdAt)
  const startAt =
    input.startAt && !Number.isNaN(input.startAt.getTime())
      ? input.startAt
      : Number.isNaN(remnawaveCreatedAt.getTime())
        ? new Date()
        : remnawaveCreatedAt

  await prisma.user.update({
    where: { id: input.localUserId },
    data: {
      ...(input.remnashopUserId ? { remnashopUserId: input.remnashopUserId } : {}),
      remnashopSyncedAt: input.remnashopUserId ? new Date() : undefined,
      remnawaveId: input.remnawaveUser.id,
      remnawaveUuid: input.remnawaveUser.uuid ?? null,
      remnawaveShortUuid: input.remnawaveUser.shortUuid,
      remnawaveUsername: input.remnawaveUser.username,
    },
  })

  const [existing, activePause] = await Promise.all([
    prisma.subscription.findFirst({
      where: { userId: input.localUserId },
      orderBy: { expireAt: 'desc' },
    }),
    prisma.subscriptionRetention.findFirst({
      where: { userId: input.localUserId, status: 'PAUSED', action: 'SUBSCRIPTION_PAUSED' },
      select: { subscriptionId: true },
      orderBy: { createdAt: 'desc' },
    }),
  ])

  const data = {
    ...(input.planId ? { planId: input.planId } : {}),
    expireAt: existing?.graceExpireAt ? existing.expireAt : new Date(input.remnawaveUser.expireAt),
    status: existing?.graceExpireAt && existing.graceExpireAt > new Date()
      ? 'LIMITED' as const
      : activePause && (!existing || activePause.subscriptionId === existing.id)
      ? 'PAUSED' as const
      : mapRemnawaveStatus(input.remnawaveUser.status),
    trafficLimitBytes: trafficLimit === 0n ? null : trafficLimit,
    trafficUsedBytes: trafficUsed,
    lifetimeUsedBytes: lifetimeUsed,
    deviceLimit: normalizeRemnawaveDeviceLimit(input.remnawaveUser.hwidDeviceLimit),
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

export function normalizeRemnawaveDeviceLimit(value: number | null | undefined) {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null
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
