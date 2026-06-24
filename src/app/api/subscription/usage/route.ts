// GET /api/subscription/usage?days=30
// Всегда возвращает агрегаты трафика. Посуточная история Remnawave дополняет
// ответ, но её отсутствие не скрывает реальный расход пользователя.

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, withAuth } from '@/lib/auth/guard'
import { remnawave, RemnawaveError } from '@/lib/remnawave'
import { readRemnawaveBigInt } from '@/lib/remnawave-usage'
import { normalizeUsageSeries } from '@/lib/traffic-usage'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = withAuth(async (req: Request) => {
  const session = await requireAuth()
  const user = await prisma.user.findUnique({
    where: { id: session.uid },
    include: {
      subscriptions: {
        orderBy: { expireAt: 'desc' },
        take: 1,
      },
    },
  })
  if (!user?.remnawaveUuid) {
    return NextResponse.json({
      series: [],
      usedBytes: '0',
      limitBytes: null,
      lifetimeBytes: '0',
      historyAvailable: false,
    })
  }

  const url = new URL(req.url)
  const days = Math.min(Math.max(parseInt(url.searchParams.get('days') || '30', 10) || 30, 1), 90)
  const end = new Date()
  const start = new Date(end)
  start.setUTCDate(start.getUTCDate() - (days - 1))
  const localSubscription = user.subscriptions[0]

  let usedBytes = localSubscription?.trafficUsedBytes ?? 0n
  let limitBytes = localSubscription?.trafficLimitBytes ?? null
  let lifetimeBytes = localSubscription?.lifetimeUsedBytes ?? usedBytes
  let series: Array<{ date: string; bytes: string }> = []
  let historyAvailable = false
  let warning: string | undefined

  const [profileResult, usageResult] = await Promise.allSettled([
    user.remnawaveUsername
      ? remnawave.getSubscriptionByUsername(user.remnawaveUsername)
      : remnawave.getUserByUuid(user.remnawaveUuid),
    remnawave.getUsageRange(user.remnawaveUuid, start, end),
  ])

  if (profileResult.status === 'fulfilled') {
    const profile = 'user' in profileResult.value.response
      ? profileResult.value.response.user
      : profileResult.value.response
    usedBytes = readRemnawaveBigInt(profile, ['trafficUsedBytes', 'usedTrafficBytes'])
    const remoteLimit = readRemnawaveBigInt(profile, ['trafficLimitBytes', 'trafficLimit'])
    limitBytes = remoteLimit === 0n ? null : remoteLimit
    lifetimeBytes = readRemnawaveBigInt(profile, [
      'lifetimeTrafficUsedBytes',
      'lifetimeUsedTrafficBytes',
    ])
  } else if (profileResult.reason instanceof RemnawaveError) {
    warning = `Remnawave ${profileResult.reason.status}`
  }

  if (usageResult.status === 'fulfilled') {
    series = normalizeUsageSeries(usageResult.value, { start, end })
    historyAvailable = series.length > 1
  } else if (!warning && usageResult.reason instanceof RemnawaveError) {
    warning = `Remnawave ${usageResult.reason.status}`
  }

  return NextResponse.json({
    series,
    usedBytes: usedBytes.toString(),
    limitBytes: limitBytes?.toString() ?? null,
    lifetimeBytes: lifetimeBytes.toString(),
    historyAvailable,
    warning,
  })
})
