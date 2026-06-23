import { createHash, randomBytes } from 'node:crypto'
import { prisma } from './prisma'
import { getAppUrl } from './app-url'
import { getBrandName } from './branding'
import { renderActionEmail } from './email-template'

const TOKEN_BYTES = 32
const TOKEN_TTL_MS = 24 * 60 * 60 * 1000

export interface EmailDeliveryResult {
  sent: boolean
  reason?: 'not_configured' | 'failed'
}

export function hashEmailVerificationToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

export async function createEmailVerificationToken(userId: string) {
  const token = randomBytes(TOKEN_BYTES).toString('base64url')
  const tokenHash = hashEmailVerificationToken(token)

  await prisma.$transaction([
    prisma.emailVerificationToken.updateMany({
      where: { userId, usedAt: null },
      data: { usedAt: new Date() },
    }),
    prisma.emailVerificationToken.create({
      data: {
        userId,
        tokenHash,
        expiresAt: new Date(Date.now() + TOKEN_TTL_MS),
      },
    }),
  ])

  return token
}

export async function verifyEmailToken(token: string) {
  const tokenHash = hashEmailVerificationToken(token)
  const row = await prisma.emailVerificationToken.findUnique({
    where: { tokenHash },
    include: { user: true },
  })

  if (!row || row.usedAt || row.expiresAt <= new Date()) {
    return { ok: false as const }
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id: row.userId },
      data: { emailVerifiedAt: row.user.emailVerifiedAt ?? new Date() },
    }),
    prisma.emailVerificationToken.update({
      where: { id: row.id },
      data: { usedAt: new Date() },
    }),
  ])

  return { ok: true as const, email: row.user.email }
}

export async function sendEmailVerificationLink(input: {
  email: string
  name?: string | null
  token: string
}): Promise<EmailDeliveryResult> {
  const appUrl = getAppUrl()
  const verifyUrl = `${appUrl}/api/auth/verify-email?token=${encodeURIComponent(input.token)}`
  const webhookUrl = process.env.EMAIL_VERIFICATION_WEBHOOK_URL

  if (!webhookUrl) {
    if (process.env.NODE_ENV !== 'production') {
      console.info(`[email-verification] ${input.email}: ${verifyUrl}`)
    }
    return { sent: false, reason: 'not_configured' }
  }

  const subject = `Подтвердите email в ${getBrandName()}`
  const text = [
    `Здравствуйте${input.name ? `, ${input.name}` : ''}.`,
    '',
    'Остался один шаг: подтвердите почту, чтобы завершить регистрацию и войти в кабинет.',
    '',
    'Нажмите кнопку в письме или откройте ссылку:',
    verifyUrl,
    '',
    'Ссылка действует 24 часа.',
    'Если вы не регистрировались, просто проигнорируйте это письмо.',
  ].join('\n')

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
      subject,
      text,
      html: renderActionEmail({
        eyebrow: 'Подтверждение аккаунта',
        title: 'Подтвердите почту',
        lead: 'Один клик, и аккаунт будет готов к покупке тарифа и получению VPN-доступа.',
        greetingName: input.name,
        body: 'Мы получили запрос на регистрацию. Подтвердите этот email, чтобы защитить аккаунт и продолжить работу в кабинете.',
        ctaLabel: 'Подтвердить email',
        ctaUrl: verifyUrl,
        expiry: 'Ссылка действует 24 часа.',
        securityNote: 'Если вы не создавали аккаунт, письмо можно спокойно проигнорировать.',
      }),
    }),
  })

  if (!res.ok) {
    console.error(`[email-verification] delivery failed: ${res.status}`)
    return { sent: false, reason: 'failed' }
  }

  return { sent: true }
}
