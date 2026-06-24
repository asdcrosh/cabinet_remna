// GET /api/subscription — карточка подписки текущего юзера.
// Данные берём из локальной БД; если их нет или они старше 1 минуты —
// синхронизируемся с Remnawave.
//
// Этот роут — главная «живая» точка для dashboard'а.

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, withAuth } from '@/lib/auth/guard'
import { remnawave, RemnawaveError } from '@/lib/remnawave'
import { serializeSubscription } from '@/lib/api-serializers'
import { readRemnawaveBigInt } from '@/lib/remnawave-usage'

export const runtime = 'nodejs'

// Данные зависят от времени → без кэша.
export const dynamic = 'force-dynamic'

const STALE_AFTER_MS = 60 * 1000 // 1 минута

export const GET = withAuth(async () => {
  const session = await requireAuth()
  const user = await prisma.user.findUnique({ where: { id: session.uid } })
  if (!user) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // 1) Активная локальная подписка
  let subscription = await prisma.subscription.findFirst({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
    include: { plan: true },
  })

  // 2) Нет Remnawave-профиля → пользователь ещё ничего не покупал
  if (!user.remnawaveUsername) {
    return NextResponse.json({ subscription: serializeSubscription(subscription) })
  }

  // 3) Синхронизация с Remnawave, если данные устарели
  const needSync =
    !subscription ||
    Date.now() - subscription.lastSyncedAt.getTime() > STALE_AFTER_MS ||
    subscription.pendingSync

  if (needSync) {
    try {
      const data = await remnawave.getSubscriptionByUsername(user.remnawaveUsername)
      const u = data.response.user
      const limit = readRemnawaveBigInt(u, ['trafficLimitBytes', 'trafficLimit'])

      const dataToSave = {
        expireAt: new Date(u.expiresAt),
        status: mapRemnawaveStatus(u.userStatus),
        trafficLimitBytes: limit === 0n ? null : limit,
        trafficUsedBytes: readRemnawaveBigInt(u, ['trafficUsedBytes', 'usedTrafficBytes']),
        lifetimeUsedBytes: readRemnawaveBigInt(u, ['lifetimeTrafficUsedBytes', 'lifetimeUsedTrafficBytes']),
        lastSyncedAt: new Date(),
        pendingSync: false,
      }

      subscription = subscription
        ? await prisma.subscription.update({
            where: { id: subscription.id },
            data: dataToSave,
            include: { plan: true },
          })
        : await prisma.subscription.create({
            data: {
              userId: user.id,
              startAt: new Date(),
              ...dataToSave,
            },
            include: { plan: true },
          })
    } catch (e) {
      // Не валим UI из-за временных проблем Remnawave
      console.error('[subscription] remnawave sync failed:', e)
      if (e instanceof RemnawaveError) {
        return NextResponse.json(
          { subscription: serializeSubscription(subscription), warning: `Remnawave API ${e.status}` },
          { status: 200 }
        )
      }
    }
  }

  return NextResponse.json({ subscription: serializeSubscription(subscription) })
})

function mapRemnawaveStatus(status: 'ACTIVE' | 'LIMITED' | 'EXPIRED' | 'DISABLED') {
  switch (status) {
    case 'ACTIVE':
      return 'ACTIVE' as const
    case 'LIMITED':
      return 'LIMITED' as const
    case 'EXPIRED':
      return 'EXPIRED' as const
    case 'DISABLED':
      return 'DISABLED' as const
  }
}
