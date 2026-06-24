// POST /api/auth/login

import { NextResponse } from 'next/server'
import { compare, hash } from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { loginSchema } from '@/lib/auth/validation'
import { setSessionCookieOnResponse } from '@/lib/auth/cookies'
import { rateLimit } from '@/lib/rate-limit'
import { assertSameOrigin } from '@/lib/security'
import { checkRemnawaveProfileOnLogin } from '@/lib/remnawave-profile-check'
import { authenticateRemnashopEmail, registerRemnashopEmailUser } from '@/lib/remnashop-api'
import { findRemnashopUserByEmail } from '@/lib/remnashop-users'
import { generateUniqueReferralCode } from '@/lib/referrals'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  try {
    assertSameOrigin(req)
  } catch {
    return NextResponse.json({ error: 'Invalid request origin' }, { status: 403 })
  }

  const limited = await rateLimit(req, 'auth-login', 10, 60_000)
  if (!limited.ok) {
    return NextResponse.json(
      { error: 'Слишком много попыток входа. Попробуйте позже.' },
      { status: 429, headers: { 'Retry-After': String(limited.retryAfter) } }
    )
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = loginSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation error', details: parsed.error.flatten() },
      { status: 400 }
    )
  }

  const { email, password } = parsed.data

  let user = await prisma.user.findUnique({ where: { email } })
  // Сравниваем даже при отсутствии пользователя — чтобы тайминг не указывал наличия
  const fakeHash = '$2a$12$0000000000000000000000.0000000000000000000000000000000000'
  let isValid = await compare(password, user?.passwordHash ?? fakeHash)

  if (!isValid && process.env.REMNASHOP_API_URL && process.env.REMNASHOP_DATABASE_URL) {
    try {
      const authenticated = await authenticateRemnashopEmail(email, password)
      if (authenticated) {
        const source = await findRemnashopUserByEmail(email)
        if (source) {
          const telegramId = source.telegram_id ? BigInt(source.telegram_id) : null
          const passwordHash = await hash(password, 12)
          user = user
            ? await prisma.user.update({
                where: { id: user.id },
                data: {
                  passwordHash,
                  remnashopUserId: user.remnashopUserId ?? source.id,
                  remnashopSyncedAt: new Date(),
                  telegramId: user.telegramId ?? telegramId,
                  telegramUsername: user.telegramUsername ?? source.username,
                  telegramLinkedAt: user.telegramLinkedAt ?? (telegramId ? new Date() : null),
                  emailVerifiedAt: user.emailVerifiedAt ?? (source.is_email_verified ? new Date() : null),
                },
              })
            : await prisma.user.create({
                data: {
                  email,
                  passwordHash,
                  name: source.name,
                  role: 'USER',
                  referralCode: await generateUniqueReferralCode(),
                  telegramId,
                  telegramUsername: source.username,
                  telegramLinkedAt: telegramId ? new Date() : null,
                  emailVerifiedAt: source.is_email_verified ? new Date() : null,
                  remnashopUserId: source.id,
                  remnashopSyncedAt: new Date(),
                },
              })
          isValid = true
        }
      }
    } catch (error) {
      console.warn('[auth/login] remnashop fallback unavailable', {
        email,
        message: error instanceof Error ? error.message : 'unknown error',
      })
    }
  }

  if (!user || !isValid) {
    return NextResponse.json(
      { error: 'Неверный email или пароль' },
      { status: 401 }
    )
  }

  if (process.env.REMNASHOP_API_URL && !user.remnashopUserId) {
    try {
      await registerRemnashopEmailUser({
        email: user.email,
        password,
        name: user.name,
      })
      const source = process.env.REMNASHOP_DATABASE_URL
        ? await findRemnashopUserByEmail(user.email)
        : null
      if (source) {
        user = await prisma.user.update({
          where: { id: user.id },
          data: {
            remnashopUserId: source.id,
            remnashopSyncedAt: new Date(),
          },
        })
      }
    } catch (error) {
      console.warn('[auth/login] remnashop registration retry deferred', {
        userId: user.id,
        message: error instanceof Error ? error.message : 'unknown error',
      })
    }
  }

  if (!user.emailVerifiedAt) {
    return NextResponse.json(
      { error: 'Подтвердите email перед входом', code: 'EMAIL_NOT_VERIFIED' },
      { status: 403 }
    )
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  })

  await checkRemnawaveProfileOnLogin({
    id: user.id,
    remnawaveUuid: user.remnawaveUuid,
    remnawaveUsername: user.remnawaveUsername,
  })

  const res = NextResponse.json({
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
  })
  return setSessionCookieOnResponse(res, {
    uid: user.id,
    email: user.email,
    role: user.role,
  })
}
