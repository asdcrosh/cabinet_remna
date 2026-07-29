// POST /api/me/password — смена пароля текущего юзера.

import { NextResponse } from 'next/server'
import { compare, hash } from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { changePasswordSchema } from '@/lib/auth/validation'
import { withAuth, requireAuth } from '@/lib/auth/guard'
import { setSessionCookieOnResponse } from '@/lib/auth/cookies'
import { rateLimit } from '@/lib/rate-limit'
import { changeRemnashopPassword } from '@/lib/remnashop-api'
import { createAdminNotification } from '@/lib/admin-notifications'

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
  if (user.remnashopUserId && process.env.REMNASHOP_API_URL) {
    let remotePassword: Awaited<ReturnType<typeof changeRemnashopPassword>>
    try {
      remotePassword = await changeRemnashopPassword({
        email: user.email,
        currentPassword: oldPassword,
        newPassword,
      })
    } catch {
      return NextResponse.json(
        {
          error: 'Remnashop сейчас недоступен. Пароль не изменён, попробуйте позже.',
          code: 'REMNASHOP_PASSWORD_SYNC_FAILED',
        },
        { status: 502 }
      )
    }
    if (remotePassword.configured && !remotePassword.changed) {
      await createAdminNotification({
        type: 'identity_conflict',
        severity: 'WARNING',
        dedupeKey: `identity:remnashop-password:${user.id}`,
        title: 'Пароли аккаунта расходятся',
        body: 'Cabinet не изменил пароль, потому что Remnashop не принял текущий пароль.',
        entityType: 'user',
        entityId: user.id,
        actionHref: `/dashboard/admin/users?q=${encodeURIComponent(user.id)}`,
        actionLabel: 'Проверить аккаунт',
      })
      return NextResponse.json(
        {
          error: 'Пароль в старом аккаунте Remnashop отличается. Обратитесь в поддержку, чтобы объединить доступ.',
          code: 'REMNASHOP_PASSWORD_CONFLICT',
        },
        { status: 409 }
      )
    }
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
