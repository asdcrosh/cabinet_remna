import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, withAuth } from '@/lib/auth/guard'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = withAuth(async () => {
  const session = await requireAuth()
  const user = await prisma.user.findUnique({
    where: { id: session.uid },
    select: { role: true },
  })

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const [userUnread, adminUnread] = await Promise.all([
    prisma.supportTicket.aggregate({
      where: { userId: session.uid },
      _sum: { userUnreadCount: true },
    }),
    user.role === 'ADMIN'
      ? prisma.supportTicket.aggregate({
          where: { status: 'WAITING_ADMIN' },
          _sum: { adminUnreadCount: true },
        })
      : Promise.resolve({ _sum: { adminUnreadCount: 0 } }),
  ])

  return NextResponse.json({
    badges: {
      '/dashboard/support': userUnread._sum.userUnreadCount ?? 0,
      '/dashboard/admin/support': adminUnread._sum.adminUnreadCount ?? 0,
    },
  })
})
