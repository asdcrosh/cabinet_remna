import { NextResponse } from 'next/server'
import { SubscriptionStatus } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { requireAdmin, withAuth } from '@/lib/auth/guard'
import { serializeSubscription } from '@/lib/api-serializers'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = withAuth(async (req: Request) => {
  await requireAdmin()

  const url = new URL(req.url)
  const status = url.searchParams.get('status')
  const q = url.searchParams.get('q')?.trim()

  const subscriptions = await prisma.subscription.findMany({
    where: {
      ...(status && status in SubscriptionStatus ? { status: status as SubscriptionStatus } : {}),
      ...(q
        ? {
            OR: [
              { id: { contains: q, mode: 'insensitive' } },
              { user: { email: { contains: q, mode: 'insensitive' } } },
              { plan: { name: { contains: q, mode: 'insensitive' } } },
            ],
          }
        : {}),
    },
    orderBy: { expireAt: 'desc' },
    take: 100,
    include: {
      plan: true,
      user: { select: { id: true, email: true, name: true, remnawaveUuid: true, remnawaveUsername: true } },
    },
  })

  return NextResponse.json({ subscriptions: subscriptions.map(serializeSubscription) })
})
