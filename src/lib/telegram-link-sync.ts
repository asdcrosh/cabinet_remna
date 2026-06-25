import { prisma } from './prisma'
import { remnawave } from './remnawave'
import { remnashopQuery } from './remnashop-db'
import { toRemnawaveTelegramId } from './telegram-remnawave'
import { upsertLocalSubscriptionFromRemnawave } from './remnawave-local-sync'

interface RemnashopTelegramUserRow {
  id: number
  telegram_id: string
  name: string
  current_subscription_id: number | null
  user_remna_id: string | null
}

export async function findRemnashopUserByTelegramId(telegramId: bigint) {
  if (!process.env.REMNASHOP_DATABASE_URL) {
    throw new Error('REMNASHOP_DATABASE_URL is not configured')
  }

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

export async function attachRemnashopIdentityToCabinetUser(input: {
  localUserId: string
  telegramId: bigint
}) {
  const localUser = await prisma.user.findUnique({
    where: { id: input.localUserId },
    select: {
      email: true,
      emailVerifiedAt: true,
    },
  })
  if (!localUser) throw new Error('Cabinet user not found')

  if (localUser.emailVerifiedAt && !localUser.email.endsWith('@pending.invalid')) {
    try {
      await remnashopQuery(
        'SELECT * FROM public.cabinet_link_email_to_telegram($1::bigint, $2::text, $3::boolean)',
        [input.telegramId.toString(), localUser.email, true]
      )
    } catch (error) {
      const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : ''
      if (code !== '42883') throw error
    }
  }

  const remnashopUser = await findRemnashopUserByTelegramId(input.telegramId)
  if (!remnashopUser) {
    await prisma.user.update({
      where: { id: input.localUserId },
      data: { remnashopSyncedAt: new Date() },
    })
    return null
  }

  await prisma.user.update({
    where: { id: input.localUserId },
    data: {
      remnashopUserId: remnashopUser.id,
      remnashopSyncedAt: new Date(),
      ...(remnashopUser.user_remna_id ? { remnawaveUuid: remnashopUser.user_remna_id } : {}),
    },
  })

  return remnashopUser
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
  const remnashopUser = await attachRemnashopIdentityToCabinetUser(input)
  if (!remnashopUser) {
    await prisma.user.update({
      where: { id: input.localUserId },
      data: { remnashopSyncedAt: new Date() },
    })
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
      tag: 'IMPORTED',
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
    tag: 'IMPORTED',
  })

  return true as const
}
