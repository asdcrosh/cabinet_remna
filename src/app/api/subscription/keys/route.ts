// GET /api/subscription/keys — публичная для пользователя ссылка подписки.
// Отдельные протокольные ключи не отдаём в кабинет.

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, withAuth } from '@/lib/auth/guard'
import { remnawave, RemnawaveError } from '@/lib/remnawave'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = withAuth(async () => {
  const session = await requireAuth()
  const user = await prisma.user.findUnique({ where: { id: session.uid } })
  if (!user?.remnawaveUsername) {
    return NextResponse.json({ keys: null, message: 'Нет активной подписки' })
  }

  try {
    const data = await remnawave.getSubscriptionByUsername(user.remnawaveUsername)
    return NextResponse.json({
      keys: {
        subscriptionUrl: data.response.subscriptionUrl,
      },
      // Состояние подписки (для UI)
      status: {
        isActive: data.response.user.isActive,
        userStatus: data.response.user.userStatus,
        daysLeft: data.response.user.daysLeft,
        trafficUsed: data.response.user.trafficUsed,
        trafficLimit: data.response.user.trafficLimit,
        expiresAt: data.response.user.expiresAt,
      },
    })
  } catch (e) {
    if (e instanceof RemnawaveError) {
      return NextResponse.json(
        {
          error: 'Не удалось загрузить ключи. Попробуйте позже.',
          details: process.env.NODE_ENV === 'development' ? e.body : undefined,
        },
        { status: 502 }
      )
    }
    throw e
  }
})
