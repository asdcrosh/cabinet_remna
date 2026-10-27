import { jsonResponse } from '@/lib/json-response'
import { requireStaff, withAuth } from '@/lib/auth/guard'
import { prisma } from '@/lib/prisma'
import { serializeAdminNotification } from '@/lib/admin-notifications'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = withAuth(async () => {
  const session = await requireStaff()

  const whereUnread = {
    reads: { none: { userId: session.uid } },
  }

  const [unreadCount, notifications] = await Promise.all([
    prisma.adminNotification.count({ where: whereUnread }),
    prisma.adminNotification.findMany({
      where: whereUnread,
      orderBy: { createdAt: 'desc' },
      take: 5,
      include: { reads: { where: { userId: session.uid }, select: { readAt: true } } },
    }),
  ])

  return jsonResponse({
    unreadCount,
    notifications: notifications.map(serializeAdminNotification),
  })
})
