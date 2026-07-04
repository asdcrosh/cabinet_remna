// POST /api/auth/register
// Создаёт ЛОКАЛЬНЫЙ аккаунт ЛК. Remnawave-профиль НЕ создаём сразу —
// он понадобится только при первой покупке подписки.

import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { hash } from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { registerSchema } from '@/lib/auth/validation'
import { rateLimit } from '@/lib/rate-limit'
import { assertSameOrigin } from '@/lib/security'
import { createEmailVerificationToken, sendEmailVerificationLink } from '@/lib/email-verification'
import { generateUniqueReferralCode, normalizeReferralCode } from '@/lib/referrals'
import { registerRemnashopEmailUser } from '@/lib/remnashop-api'
import { findRemnashopUserByEmail } from '@/lib/remnashop-users'
import { createAdminNotification } from '@/lib/admin-notifications'
import { logWarn } from '@/lib/logger'

export const runtime = 'nodejs'

function neutralRegisterResponse() {
  return NextResponse.json(
    {
      requiresEmailVerification: true,
      emailDelivery: 'sent',
    },
    { status: 202 }
  )
}

async function linkRegisteredRemnashopUser(userId: string, email: string) {
  try {
    if (!process.env.REMNASHOP_DATABASE_URL) return
    const remnashopUser = await findRemnashopUserByEmail(email)
    if (!remnashopUser) return
    await prisma.user.update({
      where: { id: userId },
      data: {
        remnashopUserId: remnashopUser.id,
        remnashopSyncedAt: new Date(),
        emailVerifiedAt: remnashopUser.is_email_verified ? new Date() : undefined,
      },
    })
  } catch (error) {
    logWarn('auth.register.remnashop_identity_link_deferred', {
      userId,
      message: error instanceof Error ? error.message : 'unknown error',
    })
  }
}

export async function POST(req: Request) {
  try {
    assertSameOrigin(req)
  } catch {
    return NextResponse.json({ error: 'Invalid request origin' }, { status: 403 })
  }

  const limited = await rateLimit(req, 'auth-register', 5, 60_000)
  if (!limited.ok) {
    return NextResponse.json(
      { error: 'Слишком много регистраций. Попробуйте позже.' },
      { status: 429, headers: { 'Retry-After': String(limited.retryAfter) } }
    )
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = registerSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation error', details: parsed.error.flatten() },
      { status: 400 }
    )
  }

  const { email, password, name, agreeToTerms } = parsed.data
  const referralCode = normalizeReferralCode(parsed.data.referralCode)

  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) {
    return neutralRegisterResponse()
  }

  const passwordHash = await hash(password, 12) // 12 — баланс CPU/безопасности
  const referrer = referralCode
    ? await prisma.user.findUnique({
        where: { referralCode },
        select: { id: true },
      })
    : null

  if (referralCode && !referrer) {
    return NextResponse.json({ error: 'Реферальный код не найден' }, { status: 404 })
  }

  let user: { id: string; email: string; role: string; name: string | null }
  try {
    user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        name: name || null,
        role: 'USER',
        referralCode: await generateUniqueReferralCode(),
        referredById: referrer?.id,
        agreedToTermsAt: agreeToTerms ? new Date() : null,
      },
      select: { id: true, email: true, role: true, name: true },
    })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return neutralRegisterResponse()
    }
    throw error
  }

  const token = await createEmailVerificationToken(user.id)
  const delivery = await sendEmailVerificationLink({
    email: user.email,
    name: user.name,
    token,
  })

  let remnashopSync: 'synced' | 'already_exists' | 'not_configured' | 'failed' = 'not_configured'
  try {
    const result = await registerRemnashopEmailUser({
      email,
      password,
      name: name || null,
      referralCode,
    })
    remnashopSync = !result.configured
      ? 'not_configured'
      : 'alreadyExists' in result
        ? 'already_exists'
        : 'synced'
    if (result.configured) {
      await linkRegisteredRemnashopUser(user.id, email)
    }
  } catch (error) {
    remnashopSync = 'failed'
    logWarn('auth.register.remnashop_deferred', {
      userId: user.id,
      message: error instanceof Error ? error.message : 'unknown error',
    })
  }

  await createAdminNotification({
    type: 'registration',
    severity: 'INFO',
    dedupeKey: `admin:registration:${user.id}`,
    title: 'Новая регистрация',
    body: `${user.email}${user.name ? `, ${user.name}` : ''}`,
    entityType: 'user',
    entityId: user.id,
    actionHref: '/dashboard/admin/users',
    actionLabel: 'Открыть пользователей',
  })

  return NextResponse.json(
    {
      user,
      requiresEmailVerification: true,
      emailDelivery: delivery.sent ? 'sent' : delivery.reason,
      remnashopSync,
    },
    { status: 201 }
  )
}
