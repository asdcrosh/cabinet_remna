import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin, withAuth } from '@/lib/auth/guard'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = withAuth(async (req: Request) => {
  await requireAdmin()

  const url = new URL(req.url)
  const q = url.searchParams.get('q')?.trim()
  const page = Math.max(1, Number(url.searchParams.get('page') || '1') || 1)
  const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get('pageSize') || '25') || 25))
  const skip = (page - 1) * pageSize

  const where = q
    ? {
        OR: [
          { email: { contains: q, mode: 'insensitive' as const } },
          { name: { contains: q, mode: 'insensitive' as const } },
          { remnawaveUsername: { contains: q, mode: 'insensitive' as const } },
        ],
      }
    : undefined

  const [total, users] = await prisma.$transaction([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: pageSize,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        remnawaveUuid: true,
        remnawaveUsername: true,
        createdAt: true,
        lastLoginAt: true,
        subscriptions: {
          orderBy: { expireAt: 'desc' },
          take: 1,
          include: { plan: true },
        },
        _count: {
          select: { payments: true, subscriptions: true, devices: true },
        },
      },
    }),
  ])

  return NextResponse.json({
    pagination: {
      page,
      pageSize,
      total,
      pageCount: Math.max(1, Math.ceil(total / pageSize)),
    },
    users: users.map((user) => ({
      ...user,
      subscriptions: user.subscriptions.map((subscription) => ({
        ...subscription,
        trafficLimitBytes: subscription.trafficLimitBytes?.toString() ?? null,
        trafficUsedBytes: subscription.trafficUsedBytes.toString(),
        lifetimeUsedBytes: subscription.lifetimeUsedBytes.toString(),
      })),
    })),
  })
})
