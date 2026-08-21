import { prisma } from './prisma'
import {
  hasRemnawaveUserReference,
  remnawave,
  type RemnawaveUserReference,
} from './remnawave'
import { remnashopQuery } from './remnashop-db'
import { toRemnawaveTelegramId } from './telegram-remnawave'
import { upsertLocalSubscriptionFromRemnawave } from './remnawave-local-sync'
import { syncLocalDevicesFromRemnawave } from './remnawave-device-sync'
import { describeSyncError } from './sync-error'
import { withDistributedLock } from './distributed-lock'
import {
  markSyncFailed,
  markSyncPending,
  markSyncSkipped,
  markSyncSucceeded,
  type SyncEventInput,
} from './sync-events'
import { createAdminNotification } from './admin-notifications'
import { logWarn } from './logger'

interface RemnashopTelegramUserRow {
  id: number
  telegram_id: string
  email: string | null
  is_email_verified: boolean
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
        u.email,
        u.is_email_verified,
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
      remnashopUserId: true,
    },
  })
  if (!localUser) throw new Error('Cabinet user not found')

  let remnashopIdentityLinked = false
  if (localUser.emailVerifiedAt && !localUser.email.endsWith('@pending.invalid')) {
    try {
      await remnashopQuery(
        'SELECT * FROM public.cabinet_link_email_to_telegram($1::bigint, $2::text, $3::boolean)',
        [input.telegramId.toString(), localUser.email, true]
      )
      remnashopIdentityLinked = true
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
  if (
    localUser.remnashopUserId &&
    localUser.remnashopUserId !== remnashopUser.id &&
    !remnashopIdentityLinked
  ) {
    throw new Error('Remnashop identity conflict: link function is not installed')
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
}, options: {
  trackEvent?: boolean
} = {}) {
  const event: SyncEventInput = {
    direction: 'REMNASHOP_TO_CABINET',
    entityType: 'telegramIdentity',
    entityId: input.localUserId,
    operation: 'sync',
    metadata: {
      telegramId: input.telegramId.toString(),
    },
  }
  const trackEvent = options.trackEvent !== false
  const locked = await withDistributedLock(
    `telegram-identity-sync:${input.localUserId}`,
    async () => {
      if (trackEvent) await markSyncPending(event)
      try {
        const result = await performLinkedTelegramSync(input)
        if (trackEvent && result.skipped) {
          await markSyncSkipped(event, result.skipped)
        } else if (trackEvent && result.warnings.length > 0) {
          const warning = new Error(result.warnings.join('; '))
          await markSyncFailed(event, warning)
          await notifyTelegramSyncIssue(input.localUserId, warning, 'WARNING')
        } else if (trackEvent) {
          await markSyncSucceeded(event)
        }
        return {
          ...result,
          alreadyRunning: false as const,
        }
      } catch (error) {
        if (trackEvent) {
          await markSyncFailed(event, error)
          await notifyTelegramSyncIssue(input.localUserId, error, 'ERROR')
        }
        throw error
      }
    }
  )

  if (!locked.acquired) {
    return {
      foundRemnashopUser: null,
      syncedRemnawave: false,
      devicesSynced: 0,
      warnings: [],
      alreadyRunning: true as const,
    }
  }

  return locked.value
}

async function performLinkedTelegramSync(input: {
  localUserId: string
  telegramId: bigint
}) {
  const warnings: string[] = []
  const localUser = await prisma.user.findUnique({
    where: { id: input.localUserId },
    select: {
      remnawaveId: true,
      remnawaveUuid: true,
      remnawaveUsername: true,
    },
  })
  const remnashopUser = await attachRemnashopIdentityToCabinetUser(input)
  const remnawaveUuid = remnashopUser?.user_remna_id ?? localUser?.remnawaveUuid ?? null
  const reference: RemnawaveUserReference = {
    id: localUser?.remnawaveId,
    uuid: remnawaveUuid,
    username: localUser?.remnawaveUsername,
  }
  const telegramId = toRemnawaveTelegramId(input.telegramId)
  let remnawaveUser = null
  let remnawaveChanged = false
  if (hasRemnawaveUserReference({
    remnawaveId: reference.id,
    remnawaveUuid: reference.uuid,
    remnawaveUsername: reference.username,
  })) {
    remnawaveUser = (await remnawave.getUser(reference)).response
    if (telegramId && !sameTelegramId(remnawaveUser.telegramId, telegramId)) {
      remnawaveUser = (await remnawave.updateUser(remnawaveUser, {
        telegramId,
        tag: 'IMPORTED',
      })).response
      remnawaveChanged = true
    }
  }

  let devicesSynced = 0
  if (remnawaveUser) {
    try {
      devicesSynced = (await syncLocalDevicesFromRemnawave({
        localUserId: input.localUserId,
        reference: remnawaveUser,
      })).total
    } catch (error) {
      warnings.push(`Устройства не обновлены: ${describeSyncError(error)}`)
    }
  }

  if (!remnashopUser) {
    return {
      foundRemnashopUser: false as const,
      syncedRemnawave: Boolean(remnawaveUser && telegramId),
      remnawaveChanged,
      devicesSynced,
      warnings,
    }
  }

  if (!remnawaveUser) {
    const skipped = remnashopUser.current_subscription_id
      ? undefined
      : 'У пользователя Remnashop нет подписки; профиль Remnawave пока не требуется.'
    if (!skipped) {
      warnings.push('Пользователь найден в Remnashop, но у него нет связанного профиля Remnawave.')
    }
    return {
      foundRemnashopUser: true as const,
      syncedRemnawave: Boolean(remnawaveUser && telegramId),
      remnawaveChanged,
      remnashopUserId: remnashopUser.id,
      devicesSynced,
      warnings,
      skipped,
    }
  }

  const subscription = await upsertLocalSubscriptionFromRemnawave({
    localUserId: input.localUserId,
    remnashopUserId: remnashopUser.id,
    remnawaveUser,
  })

  return {
    foundRemnashopUser: true as const,
    syncedRemnawave: Boolean(telegramId),
    remnawaveChanged,
    remnashopUserId: remnashopUser.id,
    remnawaveId: remnawaveUser.id,
    remnawaveUuid: remnawaveUser.uuid ?? null,
    subscriptionId: subscription.id,
    devicesSynced,
    warnings,
  }
}

function sameTelegramId(current: number | string | null | undefined, expected: number) {
  if (current == null) return false
  return String(current).trim() === String(expected)
}

async function notifyTelegramSyncIssue(
  userId: string,
  error: unknown,
  severity: 'WARNING' | 'ERROR'
) {
  const message = error instanceof Error ? error.message : String(error || 'Неизвестная ошибка')
  const day = new Date().toISOString().slice(0, 10)
  await createAdminNotification({
    type: 'remnashop_sync_error',
    severity,
    dedupeKey: `telegram-identity-sync:${userId}:${day}`,
    title: severity === 'ERROR'
      ? 'Связь Telegram не синхронизирована'
      : 'Связь Telegram синхронизирована частично',
    body: message.slice(0, 500),
    entityType: 'telegramIdentity',
    entityId: userId,
    actionHref: `/dashboard/admin/users?q=${encodeURIComponent(userId)}`,
    actionLabel: 'Проверить пользователя',
  }).catch((notificationError) => {
    logWarn('telegram.sync_notification_failed', {
      userId,
      message: notificationError instanceof Error ? notificationError.message : 'unknown error',
    })
  })
}
