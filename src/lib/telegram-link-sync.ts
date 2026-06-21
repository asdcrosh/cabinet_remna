import { prisma } from './prisma'
import { remnawave, type UserResponse } from './remnawave'
import { remnashopQuery } from './remnashop-db'
import { toRemnawaveTelegramId } from './telegram-remnawave'

interface RemnashopTelegramUserRow {
  id: number
  telegram_id: string
  name: string
  current_subscription_id: number | null
  user_remna_id: string | null
}

export async function findRemnashopUserByTelegramId(telegramId: bigint) {
  if (!process.env.REMNASHOP_DATABASE_URL) return null

  const result = await remnashopQuery<RemnashopTelegramUserRow>(
    `
      SELECT
        u.id,
        u.telegram_id::text AS telegram_id,
        u.name,
        u.current_subscription_id,
        s.user_remna_id::text AS user_remna_id
      FROM users u
      LEFT JOIN subscriptions s ON s.id = u.current_subscription_id
      WHERE u.telegram_id = $1
      LIMIT 1
    `,
    [telegramId.toString()]
  )

  return result.rows[0] ?? null
}

export async function syncLinkedTelegramUser(input: {
  localUserId: string
  telegramId: bigint
}) {
  const localUser = await prisma.user.findUnique({
    where: { id: input.localUserId },
    select: { remnawaveUuid: true },
  })
  const localRemnawaveSynced = await syncRemnawaveTelegramId(localUser?.remnawaveUuid, input.telegramId)
  const remnashopUser = await findRemnashopUserByTelegramId(input.telegramId)
  if (!remnashopUser) {
    return {
      foundRemnashopUser: false as const,
      syncedRemnawave: localRemnawaveSynced,
    }
  }

  if (!remnashopUser.user_remna_id) {
    await prisma.user.update({
      where: { id: input.localUserId },
      data: {
        remnashopUserId: remnashopUser.id,
        remnashopSyncedAt: new Date(),
      },
    })
    return {
      foundRemnashopUser: true as const,
      syncedRemnawave: localRemnawaveSynced,
      remnashopUserId: remnashopUser.id,
    }
  }

  let remnawaveUser = (await remnawave.getUserByUuid(remnashopUser.user_remna_id)).response
  const telegramId = toRemnawaveTelegramId(input.telegramId)
  if (telegramId) {
    remnawaveUser = (await remnawave.updateUser({
      uuid: remnawaveUser.uuid,
      telegramId,
    })).response
  }
  const subscription = await upsertLocalSubscriptionFromRemnawave({
    localUserId: input.localUserId,
    remnashopUserId: remnashopUser.id,
    remnawaveUser,
  })

  return {
    foundRemnashopUser: true as const,
    syncedRemnawave: true as const,
    remnashopUserId: remnashopUser.id,
    remnawaveUuid: remnawaveUser.uuid,
    subscriptionId: subscription.id,
  }
}

async function syncRemnawaveTelegramId(remnawaveUuid: string | null | undefined, telegramIdValue: bigint) {
  if (!remnawaveUuid) return false as const
  const telegramId = toRemnawaveTelegramId(telegramIdValue)
  if (!telegramId) return false as const

  await remnawave.updateUser({
    uuid: remnawaveUuid,
    telegramId,
  })

  return true as const
}

async function upsertLocalSubscriptionFromRemnawave(input: {
  localUserId: string
  remnashopUserId: number
  remnawaveUser: UserResponse
}) {
  const trafficLimit = BigInt(input.remnawaveUser.trafficLimitBytes || '0')

  await prisma.user.update({
    where: { id: input.localUserId },
    data: {
      remnashopUserId: input.remnashopUserId,
      remnashopSyncedAt: new Date(),
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
      startAt: new Date(),
      ...data,
    },
  })
}

function mapRemnawaveStatus(status: UserResponse['status']) {
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
