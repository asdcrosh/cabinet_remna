// GET /api/me — отдаёт текущего юзера (для клиентских хуков / UI).
// Не падаем с 401, а возвращаем user: null — клиенту удобнее.

import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/cookies'
import { prisma } from '@/lib/prisma'
import { requireAuth, withAuth } from '@/lib/auth/guard'
import { updateProfileSchema } from '@/lib/auth/validation'
import { logWarn } from '@/lib/logger'

export const runtime = 'nodejs'

export async function GET() {
  const session = await getCurrentUser()
  if (!session) {
    return NextResponse.json({ user: null })
  }
  // Подтянем свежие данные (имя, согласия) из БД
  const user = await prisma.user.findUnique({
    where: { id: session.uid },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      createdAt: true,
      emailVerifiedAt: true,
      telegramId: true,
      remnashopUserId: true,
      remnawaveId: true,
      remnawaveUuid: true,
      remnawaveUsername: true,
    },
  })
  if (!user) {
    logWarn('auth.me.stale_session', { userId: session.uid })
    return NextResponse.json({ user: null })
  }
  const emailVerified = Boolean(user.emailVerifiedAt && !user.email.endsWith('@pending.invalid'))
  return NextResponse.json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      createdAt: user.createdAt,
    },
    identity: {
      canonicalUserId: user.id,
      emailVerified,
      telegramLinked: Boolean(user.telegramId),
      remnashopLinked: Boolean(user.remnashopUserId),
      remnawaveLinked: Boolean(user.remnawaveId || user.remnawaveUuid || user.remnawaveUsername),
      canPay: emailVerified,
      nextAction: emailVerified
        ? null
        : {
            href: user.telegramId ? '/telegram-email' : '/dashboard/settings',
            label: 'Подтвердить email',
          },
    },
  })
}

export const PATCH = withAuth(async (req: Request) => {
  const session = await requireAuth()

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = updateProfileSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation error', details: parsed.error.flatten() },
      { status: 400 }
    )
  }

  const user = await prisma.user.update({
    where: { id: session.uid },
    data: { name: parsed.data.name?.trim() || null },
    select: { id: true, email: true, name: true, role: true, createdAt: true },
  })

  return NextResponse.json({ user })
})
