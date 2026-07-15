// POST /api/me/password — смена пароля текущего юзера.

import { NextResponse } from 'next/server'
import { compare, hash } from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { changePasswordSchema } from '@/lib/auth/validation'
import { withAuth, requireAuth } from '@/lib/auth/guard'
import { setSessionCookieOnResponse } from '@/lib/auth/cookies'
import { rateLimit } from '@/lib/rate-limit'

export const runtime = 'nodejs'

export const POST = withAuth(async (req: Request) => {
  const session = await requireAuth()
  const limited = await rateLimit(req, `change-password:${session.uid}`, 5, 60_000)
  if (!limited.ok) {
    return NextResponse.json(
      { error: 'Слишком много попыток. Попробуйте позже.' },
      { status: 429, headers: { 'Retry-After': String(limited.retryAfter) } }
    )
  }

  const body = await req.json().catch(() => null)
  const parsed = changePasswordSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation error', details: parsed.error.flatten() },
      { status: 400 }
    )
  }
  const { oldPassword, newPassword } = parsed.data
  // Берём user из БД (а не из сессии) — для свежего passwordHash
  // (требуется requireAuth → но session у нас есть; возьмём id через Prisma напрямую)
  const user = await prisma.user.findUnique({ where: { id: session.uid } })
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const ok = await compare(oldPassword, user.passwordHash)
  if (!ok) {
    return NextResponse.json({ error: 'Неверный текущий пароль' }, { status: 400 })
  }
  const newHash = await hash(newPassword, 12)
  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash: newHash,
      sessionVersion: { increment: 1 },
    },
  })

  const response = NextResponse.json({ ok: true })
  return setSessionCookieOnResponse(response, {
    uid: user.id,
    email: user.email,
    role: user.role,
    ...(session.stage ? { stage: session.stage } : {}),
  })
})
