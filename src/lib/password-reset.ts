import { createHash, randomBytes } from 'node:crypto'
import bcrypt from 'bcryptjs'
import { prisma } from './prisma'
import { getAppUrl } from './app-url'
import { getBrandName } from './branding'
import { renderActionEmail } from './email-template'
import { logError, logInfo } from './logger'

const TOKEN_BYTES = 32
const TOKEN_TTL_MS = 60 * 60 * 1000
const DELIVERY_TIMEOUT_MS = 15_000

export function hashPasswordResetToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

export async function createPasswordResetToken(userId: string) {
  const token = randomBytes(TOKEN_BYTES).toString('base64url')
  const tokenHash = hashPasswordResetToken(token)

  await prisma.$transaction([
    prisma.passwordResetToken.updateMany({
      where: { userId, usedAt: null },
      data: { usedAt: new Date() },
    }),
    prisma.passwordResetToken.create({
      data: {
        userId,
        tokenHash,
        expiresAt: new Date(Date.now() + TOKEN_TTL_MS),
      },
    }),
  ])

  return token
}

export async function sendPasswordResetLink(input: {
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
    }
    return { sent: false as const, reason: 'not_configured' as const }
  }

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
    logError('password_reset.delivery_failed', undefined, { status: res.status })
    return { sent: false as const, reason: 'failed' as const }
  }

  return { sent: true as const }
}

export async function resetPasswordByToken(input: { token: string; password: string }) {
  const tokenHash = hashPasswordResetToken(input.token)
  const row = await prisma.passwordResetToken.findUnique({ where: { tokenHash } })

  if (!row || row.usedAt || row.expiresAt <= new Date()) {
    return { ok: false as const }
  }

  const passwordHash = await bcrypt.hash(input.password, 12)
  await prisma.$transaction([
    prisma.user.update({
      where: { id: row.userId },
      data: {
        passwordHash,
        sessionVersion: { increment: 1 },
      },
    }),
    prisma.passwordResetToken.update({
      where: { id: row.id },
      data: { usedAt: new Date() },
    }),
  ])

  return { ok: true as const }
}
