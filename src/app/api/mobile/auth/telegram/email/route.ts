import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { requireAuth, withAuth } from '@/lib/auth/guard'
import { getAuthSigningKey, isMobileSession } from '@/lib/auth/jwt'
import { mobileEmailDeadline } from '@/lib/auth/mobile-email-policy'
import { createMobileSession, mobileDeviceSchema } from '@/lib/auth/mobile-session'
import { codeVerifierSchema, exchangeMobileAuthCode } from '@/lib/auth/mobile-oauth'
import { authenticatePassword, checkPasswordLoginByEmail, recordFailedPasswordLogin } from '@/lib/auth/password-login'
import { loginSchema } from '@/lib/auth/validation'
import { withDistributedLock } from '@/lib/distributed-lock'
import { sendMobileEmailCode } from '@/lib/email-verification'
import { jsonResponse } from '@/lib/json-response'
import { prisma } from '@/lib/prisma'
import { rateLimit, rateLimitKey } from '@/lib/rate-limit'
import { mergeTechnicalTelegramAccount, TelegramAccountMergeError } from '@/lib/telegram-account-merge'

export const runtime = 'nodejs'

const CODE_TTL_MS = 10 * 60_000
const MAX_ATTEMPTS = 5
const email = loginSchema.shape.email.refine(value => !value.endsWith('.invalid'))
const bodySchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('send'), email }),
  z.object({ action: z.literal('confirm'), code: z.string().regex(/^\d{6}$/) }),
  z.object({ action: z.literal('link'), email, password: loginSchema.shape.password }),
  z.object({ action: z.literal('link_oauth'), email, code: z.string().min(16).max(128), codeVerifier: codeVerifierSchema }),
])

export const POST = withAuth(async (req: Request) => {
  const session = await requireAuth()
  if (!isMobileSession(session) || !session.sid) return jsonResponse({ error: 'Войдите через приложение' }, { status: 403 })

  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return jsonResponse({ error: 'Проверьте введённые данные' }, { status: 400 })

  const { action } = parsed.data
  const [ip, account] = await Promise.all([
    rateLimit(req, `mobile-telegram-email:${action}`, 30, CODE_TTL_MS),
    rateLimitKey(`mobile-telegram-email:${action}:${session.uid}`, action === 'send' ? 4 : 12, CODE_TTL_MS),
  ])
  if (!ip.ok || !account.ok) return tooMany()

  const user = await prisma.user.findUnique({ where: { id: session.uid } })
  if (!user?.telegramId || !mobileEmailDeadline(user)) {
    return jsonResponse({ error: 'Добавление почты для этой сессии недоступно' }, { status: 403 })
  }

  switch (parsed.data.action) {
    case 'send': return sendCode(user.id, parsed.data.email)
    case 'confirm': return confirmCode(user.id, user.telegramId, parsed.data.code)
    case 'link':
    case 'link_oauth': {
      if (user.role !== 'USER') return accountConflict()
      const mobile = await prisma.mobileSession.findUnique({ where: { id: session.sid } })
      if (!mobile || mobile.userId !== user.id || mobile.revokedAt || mobile.expiresAt <= new Date()) {
        return jsonResponse({ error: 'Сессия завершена. Войдите снова.' }, { status: 401 })
      }
      const device = mobileDeviceSchema.parse({
        hwid: mobile.hwid,
        name: mobile.deviceName ?? undefined,
        platform: mobile.platform ?? undefined,
        appVersion: mobile.appVersion ?? undefined,
      })
      let target
      if (parsed.data.action === 'link') {
        if (!(await checkPasswordLoginByEmail(parsed.data.email)).ok) return tooMany()
        const password = await authenticatePassword(parsed.data.email, parsed.data.password)
        if (!password.ok) {
          if (password.status === 401) {
            await recordFailedPasswordLogin(parsed.data.email)
            return jsonResponse(password.body, { status: 422 })
          }
          return jsonResponse(password.body, { status: password.status })
        }
        target = password.user
      } else {
        const proof = await exchangeMobileAuthCode(parsed.data.code, parsed.data.codeVerifier, device.hwid)
        if (!proof.ok || proof.user.email.toLowerCase() !== parsed.data.email) {
          return jsonResponse({ error: 'Войдите в аккаунт с указанной почтой и повторите привязку.' }, { status: 422 })
        }
        target = await prisma.user.findUnique({ where: { id: proof.user.id } })
      }
      if (!target || target.role !== 'USER' || !target.emailVerifiedAt || target.id === user.id
        || target.email.toLowerCase() !== parsed.data.email) return accountConflict()
      const [first, second] = [user.id, target.id].sort()
      try {
        const telegramId = user.telegramId
        const locked = await withDistributedLock(`billing-operation:${first}`, () =>
          withDistributedLock(`billing-operation:${second}`, () =>
            mergeTechnicalTelegramAccount({
              targetUserId: target.id,
              telegramId,
              telegramUsername: user.telegramUsername,
              telegramName: user.name,
              expectedSourceUserId: user.id,
            })
          )
        )
        if (!locked.acquired || !locked.value.acquired) {
          return jsonResponse({ error: 'Сейчас обрабатывается операция по подписке. Попробуйте позже.' }, { status: 409 })
        }
        if (!locked.value.value.merged) return accountConflict()
      } catch (error) {
        if (error instanceof TelegramAccountMergeError || isConflict(error)
          || (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025')) return accountConflict()
        throw error
      }
      const tokens = await createMobileSession(target, device, req)
      return jsonResponse({ ok: true, ...tokens }, { headers: { 'Cache-Control': 'no-store' } })
    }
  }
})

async function sendCode(userId: string, email: string) {
  const addressKey = createHash('sha256').update(email).digest('hex')
  if (!(await rateLimitKey(`mobile-telegram-email:address:${addressKey}`, 4, CODE_TTL_MS)).ok) return tooMany()
  const owner = await prisma.user.findUnique({ where: { email }, select: { id: true } })
  if (owner && owner.id !== userId) return emailInUse()

  const code = randomInt(1_000_000).toString().padStart(6, '0')
  const nonce = randomBytes(24).toString('base64url')
  const challenge = { email, nonce, codeHash: hashCode(userId, nonce, code), expiresAt: new Date(Date.now() + CODE_TTL_MS), attempts: 0 }
  await prisma.mobileEmailChallenge.upsert({ where: { userId }, create: { userId, ...challenge }, update: challenge })
  const delivery = await sendMobileEmailCode(email, code).catch(() => ({ sent: false }))
  if (!delivery.sent) {
    await prisma.mobileEmailChallenge.deleteMany({ where: { userId, nonce } })
    return jsonResponse({ error: 'Не удалось отправить письмо. Попробуйте позже.' }, { status: 503 })
  }
  return jsonResponse({ ok: true })
}

async function confirmCode(userId: string, telegramId: bigint, code: string) {
  const challenge = await prisma.mobileEmailChallenge.findUnique({ where: { userId } })
  if (!challenge || challenge.expiresAt <= new Date() || challenge.attempts >= MAX_ATTEMPTS) return invalidCode()
  const where = { userId, nonce: challenge.nonce, attempts: { lt: MAX_ATTEMPTS }, expiresAt: { gt: new Date() } }
  if (!timingSafeEqual(Buffer.from(challenge.codeHash, 'hex'), Buffer.from(hashCode(userId, challenge.nonce, code), 'hex'))) {
    await prisma.mobileEmailChallenge.updateMany({ where, data: { attempts: { increment: 1 } } })
    return invalidCode()
  }
  try {
    const verified = await prisma.$transaction(async tx => {
      if ((await tx.mobileEmailChallenge.deleteMany({ where })).count !== 1) return false
      const now = new Date()
      const changed = await tx.user.updateMany({
        where: { id: userId, telegramId, emailVerifiedAt: null, mobileTelegramEmailDueAt: { not: null } },
        data: { email: challenge.email, emailVerifiedAt: now },
      })
      if (changed.count !== 1) return false
      await tx.emailVerificationToken.updateMany({ where: { userId, usedAt: null }, data: { usedAt: now } })
      return true
    })
    return verified ? jsonResponse({ ok: true }) : invalidCode()
  } catch (error) {
    if (isConflict(error)) return emailInUse()
    throw error
  }
}

function hashCode(userId: string, nonce: string, code: string) {
  return createHmac('sha256', getAuthSigningKey()).update(`mobile-email:${userId}:${nonce}:${code}`).digest('hex')
}

function isConflict(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'
}

function tooMany() {
  return jsonResponse({ error: 'Слишком много попыток. Попробуйте позже.' }, { status: 429 })
}

function invalidCode() {
  return jsonResponse({ error: 'Код неверный или истёк. Запросите новый код.' }, { status: 400 })
}

function emailInUse() {
  return jsonResponse({ error: 'Почта уже используется. Войдите в этот аккаунт, чтобы привязать Telegram.', code: 'EMAIL_IN_USE' }, { status: 409 })
}

function accountConflict() {
  return jsonResponse({ error: 'Аккаунты нельзя связать автоматически. Обратитесь в поддержку.', code: 'TELEGRAM_LINK_CONFLICT' }, { status: 409 })
}
