import { NextResponse } from 'next/server'
import { requireAdmin, withAuth } from '@/lib/auth/guard'
import { bonusBoxHistoryWhere } from '@/lib/bonus-box-admin'
import { isFeatureEnabled } from '@/lib/feature-flags'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = withAuth(async (req: Request) => {
  if (!await isFeatureEnabled('bonusBox')) {
    return new NextResponse('Not found', { status: 404 })
  }
  await requireAdmin()
  const url = new URL(req.url)
  const syncValue = url.searchParams.get('sync')
  const sync = syncValue === 'pending' || syncValue === 'ready' ? syncValue : undefined
  const rows = await prisma.bonusBoxOpening.findMany({
    where: bonusBoxHistoryWhere({
      q: url.searchParams.get('q')?.trim() || undefined,
      prizeId: url.searchParams.get('prize') || undefined,
      sync,
      from: url.searchParams.get('from') || undefined,
      to: url.searchParams.get('to') || undefined,
    }),
    orderBy: { createdAt: 'desc' },
    take: 5_000,
    include: {
      user: { select: { email: true, name: true } },
      prize: true,
      attempt: { select: { source: true } },
      promoCode: { select: { code: true, expiresAt: true } },
    },
  })

  const header = [
    'Дата',
    'Email',
    'Имя',
    'Приз',
    'Тип',
    'Значение',
    'Редкость',
    'Источник',
    'Промокод',
    'Ожидаемый шанс',
    'Синхронизация',
    'Попыток синхронизации',
    'Ошибка',
  ]
  const lines = rows.map((row) => [
    row.createdAt.toISOString(),
    row.user.email,
    row.user.name ?? '',
    row.prize.title,
    row.prize.type,
    row.prize.value,
    row.prize.rarity,
    row.attempt.source,
    row.promoCode?.code ?? '',
    row.expectedChance,
    row.remoteSynced ? 'готово' : 'ожидает',
    row.syncAttempts,
    row.lastSyncError ?? '',
  ].map(csvCell).join(';'))
  const csv = `\uFEFF${header.map(csvCell).join(';')}\n${lines.join('\n')}`

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="bonus-box-${new Date().toISOString().slice(0, 10)}.csv"`,
      'Cache-Control': 'no-store',
    },
  })
})

function csvCell(value: string | number) {
  const normalized = String(value).replaceAll('"', '""')
  return `"${normalized}"`
}
