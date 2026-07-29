import { createAdminNotification } from './admin-notifications'
import { writeAuditLog } from './audit-log'
import { logWarn } from './logger'
import type { TelegramAccountMergeError } from './telegram-account-merge'

export async function recordIdentityConflict(input: {
  targetUserId: string
  sourceUserId?: string | null
  telegramId: bigint
  code: TelegramAccountMergeError['code']
  request?: Request
}) {
  const metadata = {
    code: input.code,
    sourceUserId: input.sourceUserId ?? null,
    targetUserId: input.targetUserId,
    telegramId: input.telegramId.toString(),
  }

  await Promise.allSettled([
    createAdminNotification({
      type: 'identity_conflict',
      severity: 'WARNING',
      dedupeKey: `identity:${input.telegramId.toString()}:${input.targetUserId}:${input.code}`,
      title: 'Конфликт аккаунтов',
      body: identityConflictMessage(input.code),
      entityType: 'user',
      entityId: input.targetUserId,
      actionHref: `/dashboard/admin/users?q=${encodeURIComponent(input.targetUserId)}`,
      actionLabel: 'Проверить аккаунт',
    }),
    writeAuditLog({
      targetId: input.targetUserId,
      action: 'ADMIN_PROFILE_UPDATED',
      message: 'Автоматическое объединение аккаунтов остановлено',
      metadata,
      request: input.request,
    }),
  ]).then((results) => {
    if (results.some((result) => result.status === 'rejected')) {
      logWarn('identity.conflict_record_failed', metadata)
    }
  })
}

function identityConflictMessage(code: TelegramAccountMergeError['code']) {
  if (code === 'TELEGRAM_ALREADY_LINKED') {
    return 'У основного аккаунта уже есть другой Telegram. Автоматическая замена остановлена.'
  }
  if (code === 'PRIVILEGED_SOURCE') {
    return 'Telegram принадлежит сотруднику. Нужна ручная проверка.'
  }
  return 'Найдены две самостоятельные учётные записи или разные внешние подписки. Данные не переносились.'
}
