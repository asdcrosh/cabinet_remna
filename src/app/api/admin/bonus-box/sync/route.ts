import { NextResponse } from 'next/server'
import { requireAdmin, withAuth } from '@/lib/auth/guard'
import { writeAuditLog } from '@/lib/audit-log'
import { retryPendingBonusBoxSyncsForUser } from '@/lib/bonus-box'
import { isFeatureEnabled } from '@/lib/feature-flags'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const POST = withAuth(async (req: Request) => {
  if (!await isFeatureEnabled('bonusBox')) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  const session = await requireAdmin()

  const pendingUsers = await prisma.bonusBoxOpening.findMany({
    where: {
      remoteSynced: false,
      awardedSubscriptionId: { not: null },
    },
    select: { userId: true },
    distinct: ['userId'],
    orderBy: { createdAt: 'asc' },
    take: 10,
  })

  const results = await Promise.all(
    pendingUsers.map(({ userId }) =>
      retryPendingBonusBoxSyncsForUser(userId, { force: true, limit: 5 })
    )
  )
  const attempted = results.reduce((sum, result) => sum + result.attempted, 0)
  const synced = results.reduce((sum, result) => sum + result.synced, 0)
  const pending = await prisma.bonusBoxOpening.count({
    where: { remoteSynced: false },
  })

  if (attempted > 0) {
    await writeAuditLog({
      actorId: session.uid,
      action: 'PAYMENT_SYNCED',
      message: 'Администратор повторил синхронизацию подарков',
      metadata: { attempted, synced, pending },
      request: req,
    })
  }

  return NextResponse.json({ attempted, synced, pending })
})
