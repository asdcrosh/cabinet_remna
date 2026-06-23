// POST /api/auth/login

import { NextResponse } from 'next/server'
import { compare } from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { loginSchema } from '@/lib/auth/validation'
import { setSessionCookieOnResponse } from '@/lib/auth/cookies'
import { rateLimit } from '@/lib/rate-limit'
import { assertSameOrigin } from '@/lib/security'
import { checkRemnawaveProfileOnLogin } from '@/lib/remnawave-profile-check'

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

  const user = await prisma.user.findUnique({ where: { email } })
  // Сравниваем даже при отсутствии пользователя — чтобы тайминг не указывал наличия
  const fakeHash = '$2a$12$0000000000000000000000.0000000000000000000000000000000000'
  const isValid = await compare(password, user?.passwordHash ?? fakeHash)

  if (!user || !isValid) {
    return NextResponse.json(
      { error: 'Неверный email или пароль' },
      { status: 401 }
    )
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
