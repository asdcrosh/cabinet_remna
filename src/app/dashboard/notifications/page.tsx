import Link from 'next/link'
import { Settings2 } from 'lucide-react'
import { PageHeader } from '@/components/dashboard/page-header'
import { NotificationsList } from '@/components/dashboard/notifications-list'
import { requireAuth } from '@/lib/auth/guard'
import { prisma } from '@/lib/prisma'
import { prepareUserNotificationForDisplay, serializeUserNotification } from '@/lib/user-notifications'

export const dynamic = 'force-dynamic'

export default async function NotificationsPage() {
  const session = await requireAuth()
  const pageSize = 30
  const notifications = await prisma.userNotification.findMany({
    where: { userId: session.uid },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: pageSize + 1,
  })
  const hasMore = notifications.length > pageSize
  const page = notifications.slice(0, pageSize)
  const notificationViews = page.map(serializeUserNotification).map((item) => prepareUserNotificationForDisplay(item))

  return (
    <div className="user-workspace page-stack">
      <PageHeader
        title="Уведомления"
        description="События по подписке, оплатам и поддержке."
        action={(
          <Link href="/dashboard/settings?section=notifications" className="btn-secondary w-full sm:w-auto">
            <Settings2 className="h-4 w-4" />
            Настроить
          </Link>
        )}
      />
      <NotificationsList
        initialNotifications={notificationViews}
        initialHasMore={hasMore}
        initialCursor={hasMore ? page.at(-1)?.id ?? null : null}
      />
    </div>
  )
}
