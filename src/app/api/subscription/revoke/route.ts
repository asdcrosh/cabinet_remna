// POST /api/subscription/revoke — перевыпустить ключи доступа.
// Создаёт новые vlessUuid/trojanPassword/ssPassword в Remnawave,
// старые ссылки у пользователя перестают работать.

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, withAuth } from '@/lib/auth/guard'
import { remnawave, RemnawaveError } from '@/lib/remnawave'

export const runtime = 'nodejs'

export const POST = withAuth(async (_req: Request) => {
  const session = await requireAuth()
  const user = await prisma.user.findUnique({ where: { id: session.uid } })
  if (!user?.remnawaveUuid) {
    return NextResponse.json({ error: 'Нет активной подписки' }, { status: 404 })
  }
  try {
    await remnawave.revokeSubscription(user.remnawaveUuid)
    await prisma.subscription.updateMany({
      where: { userId: user.id, status: { in: ['ACTIVE', 'LIMITED'] } },
      data: { pendingSync: true },
    })
    return NextResponse.json({ ok: true })
  } catch (e) {
    if (e instanceof RemnawaveError) {
      return NextResponse.json(
        { error: 'Не удалось перевыпустить ключи. Попробуйте позже.' },
        { status: 502 }
      )
    }
    throw e
  }
})
