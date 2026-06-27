import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, withAuth } from '@/lib/auth/guard'
import { serializeUserNotification } from '@/lib/user-notifications'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = withAuth(async () => {
  const session = await requireAuth()

  const [unreadCount, notifications] = await Promise.all([
    prisma.userNotification.count({ where: { userId: session.uid, readAt: null } }),
    prisma.userNotification.findMany({
      where: { userId: session.uid },
      orderBy: { createdAt: 'desc' },
      take: 5,
    }),
  ])

  return NextResponse.json({
    unreadCount,
    notifications: notifications.map(serializeUserNotification),
  })
})
