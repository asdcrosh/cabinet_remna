import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin, withAuth } from '@/lib/auth/guard'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = withAuth(async () => {
  await requireAdmin()

  const now = new Date()
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  const soon = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)

  const [
    usersTotal,
    usersNew7d,
    activeSubscriptions,
    expiringSoon,
    recoveryCount,
    succeededPayments,
    succeededAmount,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { createdAt: { gte: sevenDaysAgo } } }),
    prisma.subscription.count({ where: { status: { in: ['ACTIVE', 'LIMITED'] } } }),
    prisma.subscription.count({
      where: { status: { in: ['ACTIVE', 'LIMITED'] }, expireAt: { gte: now, lte: soon } },
    }),
    prisma.payment.count({
      where: { status: 'SUCCEEDED', subscriptionProvisionedAt: null },
    }),
    prisma.payment.count({ where: { status: 'SUCCEEDED' } }),
    prisma.payment.aggregate({
      where: { status: 'SUCCEEDED' },
      _sum: { amountKopecks: true },
    }),
  ])

  return NextResponse.json({
    usersTotal,
    usersNew7d,
    activeSubscriptions,
    expiringSoon,
    recoveryCount,
    succeededPayments,
    succeededAmountKopecks: succeededAmount._sum.amountKopecks ?? 0,
  })
})
