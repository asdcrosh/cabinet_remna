import { createHash, randomBytes } from 'node:crypto'
import bcrypt from 'bcryptjs'
import { prisma } from './prisma'
import { getAppUrl } from './app-url'
import { getBrandName } from './branding'
import { renderActionEmail } from './email-template'
import { logError, logInfo } from './logger'
import { createAdminNotification } from './admin-notifications'
import { syncResetPasswordToRemnashop } from './remnashop-password-sync'
import { writeAuditLog } from './audit-log'

const TOKEN_BYTES = 32
const TOKEN_TTL_MS = 60 * 60 * 1000
const DELIVERY_TIMEOUT_MS = 15_000

export function hashPasswordResetToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

export async function createPasswordResetToken(userId: string) {
  const token = randomBytes(TOKEN_BYTES).toString('base64url')
  const tokenHash = hashPasswordResetToken(token)

  await prisma.passwordResetToken.create({
    data: {
      userId,
      tokenHash,
      expiresAt: new Date(Date.now() + TOKEN_TTL_MS),
    },
  })

  return token
}

export async function sendPasswordResetLink(input: {
  userId: string
  email: string
  name?: string | null
  token: string
}) {
  const appUrl = getAppUrl()
  const resetUrl = `${appUrl}/reset-password?token=${encodeURIComponent(input.token)}`
  const webhookUrl = process.env.EMAIL_VERIFICATION_WEBHOOK_URL

  if (!webhookUrl) {
    if (process.env.NODE_ENV !== 'production') {
      logInfo('password_reset.dev_link', { email: input.email, resetUrl })
    } else {
      await notifyPasswordResetDeliveryIssue(input.userId, input.email, 'webhook not configured')
    }
    return { sent: false as const, reason: 'not_configured' as const }
  }

  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(process.env.EMAIL_VERIFICATION_WEBHOOK_SECRET
          ? { Authorization: `Bearer ${process.env.EMAIL_VERIFICATION_WEBHOOK_SECRET}` }
          : {}),
      },
      body: JSON.stringify({
        to: input.email,
        subject: `Восстановление пароля в ${getBrandName()}`,
        text: [
          `Здравствуйте${input.name ? `, ${input.name}` : ''}.`,
          '',
          'Мы получили запрос на восстановление пароля.',
          '',
          'Чтобы задать новый пароль, нажмите кнопку в письме или откройте ссылку:',
          resetUrl,
          '',
          'Ссылка действует 1 час.',
          'Если вы не запрашивали восстановление, просто проигнорируйте это письмо.',
        ].join('\n'),
        html: renderActionEmail({
          eyebrow: 'Восстановление доступа',
          title: 'Задайте новый пароль',
          lead: 'Ссылка одноразовая и поможет быстро вернуть доступ к личному кабинету.',
          greetingName: input.name,
          body: 'Мы получили запрос на смену пароля. Перейдите по защищённой ссылке ниже и задайте новый пароль для аккаунта.',
          ctaLabel: 'Задать новый пароль',
          ctaUrl: resetUrl,
          expiry: 'Ссылка действует 1 час.',
          securityNote: 'Если вы не запрашивали восстановление пароля, письмо можно спокойно проигнорировать.',
        }),
      }),
      signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
    })

    if (!res.ok) {
      await notifyPasswordResetDeliveryIssue(input.userId, input.email, `HTTP ${res.status}`)
      return { sent: false as const, reason: 'failed' as const }
    }

    return { sent: true as const }
  } catch (error) {
    await notifyPasswordResetDeliveryIssue(input.userId, input.email, 'webhook unavailable', error)
    return { sent: false as const, reason: 'failed' as const }
  }
}

export async function resetPasswordByToken(input: { token: string; password: string }) {
  const tokenHash = hashPasswordResetToken(input.token)
  const row = await prisma.passwordResetToken.findUnique({
    where: { tokenHash },
    include: {
      user: {
        select: {
          email: true,
          remnashopUserId: true,
        },
      },
    },
  })

  if (!row || row.usedAt || row.expiresAt <= new Date()) {
    return { ok: false as const }
  }

  const passwordHash = await bcrypt.hash(input.password, 12)
  const claimed = await prisma.$transaction(async (tx) => {
    const claim = await tx.passwordResetToken.updateMany({
      where: {
        id: row.id,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
      data: { usedAt: new Date() },
    })
    if (claim.count !== 1) return false

    await tx.passwordResetToken.updateMany({
      where: { userId: row.userId, usedAt: null },
      data: { usedAt: new Date() },
    })

    await tx.user.update({
      where: { id: row.userId },
      data: {
        passwordHash,
        sessionVersion: { increment: 1 },
      },
    })
    return true
  })
  if (!claimed) return { ok: false as const }
  try {
    await writeAuditLog({
      actorId: row.userId,
      targetId: row.userId,
      action: 'USER_PASSWORD_CHANGED',
      message: 'Пользователь восстановил пароль по ссылке',
    })
  } catch (error) {
    logError('password_reset.audit_failed', error, { userId: row.userId })
  }

  let remnashopSync: 'synced' | 'not_linked' | 'not_configured' | 'failed' = 'not_linked'
  if (row.user.remnashopUserId) {
    try {
      const result = await syncResetPasswordToRemnashop({
        remnashopUserId: row.user.remnashopUserId,
        email: row.user.email,
        password: input.password,
      })
      remnashopSync = result.ok
        ? 'synced'
        : result.reason === 'database_not_configured'
          ? 'not_configured'
          : 'failed'
      if (!result.ok && result.reason !== 'database_not_configured') {
        await notifyRemnashopPasswordSyncIssue(row.userId, row.user.email, result.reason)
      }
    } catch (error) {
      remnashopSync = 'failed'
      logError('password_reset.remnashop_sync_failed', error, { userId: row.userId })
      await notifyRemnashopPasswordSyncIssue(row.userId, row.user.email, 'sync_failed')
    }
  }

  return { ok: true as const, remnashopSync }
}

async function notifyPasswordResetDeliveryIssue(
  userId: string,
  email: string,
  reason: string,
  error?: unknown
) {
  logError('password_reset.delivery_failed', error, { userId, reason })
  if (process.env.NODE_ENV !== 'production') return

  try {
    await createAdminNotification({
      type: 'password_reset_delivery_error',
      severity: 'ERROR',
      dedupeKey: `admin:password-reset-delivery:${userId}`,
      title: 'Не доставлена ссылка восстановления',
      body: `${email}: ${reason}`,
      entityType: 'user',
      entityId: userId,
      actionHref: '/dashboard/admin/recovery',
      actionLabel: 'Помочь восстановить доступ',
    })
  } catch (error) {
    logError('password_reset.delivery_notification_failed', error, { userId })
  }
}

async function notifyRemnashopPasswordSyncIssue(
  userId: string,
  email: string,
  reason: string
) {
  try {
    await createAdminNotification({
      type: 'remnashop_sync_error',
      severity: 'WARNING',
      dedupeKey: `admin:remnashop-password-reset:${userId}`,
      title: 'Пароль Remnashop не обновлён',
      body: `${email}: ${passwordSyncReason(reason)}`,
      entityType: 'user',
      entityId: userId,
      actionHref: '/dashboard/admin/remnashop-sync',
      actionLabel: 'Проверить интеграцию',
    })
  } catch (error) {
    logError('password_reset.remnashop_notification_failed', error, { userId })
  }
}

function passwordSyncReason(reason: string) {
  if (reason === 'crypt_key_not_configured') return 'не настроен ключ хеширования Remnashop'
  if (reason === 'redis_not_configured') return 'не настроен отзыв активных сессий Remnashop'
  if (reason === 'user_not_found') return 'связанный пользователь не найден'
  return 'ошибка синхронизации после восстановления пароля'
}
