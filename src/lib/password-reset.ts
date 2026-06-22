import { createHash, randomBytes } from 'node:crypto'
import bcrypt from 'bcryptjs'
import { prisma } from './prisma'
import { getAppUrl } from './app-url'

const TOKEN_BYTES = 32
const TOKEN_TTL_MS = 60 * 60 * 1000

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
      console.info(`[password-reset] ${input.email}: ${resetUrl}`)
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
      subject: 'Восстановление пароля',
      text: [
        `Здравствуйте${input.name ? `, ${input.name}` : ''}.`,
        '',
        'Чтобы задать новый пароль, откройте ссылку:',
        resetUrl,
        '',
        'Ссылка действует 1 час.',
      ].join('\n'),
      html: renderPasswordResetHtml({ name: input.name, resetUrl }),
    }),
  })

  if (!res.ok) {
    console.error(`[password-reset] delivery failed: ${res.status}`)
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
      data: { passwordHash },
    }),
    prisma.passwordResetToken.update({
      where: { id: row.id },
      data: { usedAt: new Date() },
    }),
  ])

  return { ok: true as const }
}

function renderPasswordResetHtml(input: { name?: string | null; resetUrl: string }) {
  const greeting = input.name ? `Здравствуйте, ${escapeHtml(input.name)}.` : 'Здравствуйте.'
  return `
    <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #0f172a;">
      <p>${greeting}</p>
      <p>Чтобы задать новый пароль, откройте ссылку ниже.</p>
      <p>
        <a href="${input.resetUrl}" style="display:inline-block;background:#2563eb;color:#fff;padding:10px 14px;border-radius:8px;text-decoration:none;">
          Задать новый пароль
        </a>
      </p>
      <p style="color:#64748b;font-size:13px;">Ссылка действует 1 час.</p>
    </div>
  `.trim()
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case '&':
        return '&amp;'
      case '<':
        return '&lt;'
      case '>':
        return '&gt;'
      case '"':
        return '&quot;'
      case "'":
        return '&#039;'
      default:
        return char
    }
  })
}
