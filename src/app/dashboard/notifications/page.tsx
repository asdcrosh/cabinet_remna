import { PageHeader } from '@/components/dashboard/page-header'
import { NotificationsList } from '@/components/dashboard/notifications-list'
import { requireAuth } from '@/lib/auth/guard'
import { prisma } from '@/lib/prisma'
import { serializeUserNotification } from '@/lib/user-notifications'

export const dynamic = 'force-dynamic'

export default async function NotificationsPage() {
  const session = await requireAuth()
  const notifications = await prisma.userNotification.findMany({
    where: { userId: session.uid },
    orderBy: { createdAt: 'desc' },
    take: 100,
  })
  const now = Date.now()
  const notificationViews = notifications.map(serializeUserNotification).map((notification) => {
    const staleExpiringBonus = notification.type === 'BONUS_GRANTED'
      && notification.title.toLocaleLowerCase('ru-RU').includes('скоро истеч')
      && now - new Date(notification.createdAt).getTime() > 3 * 24 * 60 * 60 * 1000
    return staleExpiringBonus
      ? { ...notification, actionHref: null, actionLabel: null }
      : notification
  })

  return (
    <div className="page-stack">
      <PageHeader title="Уведомления" description="Только важные события по платежам, подписке и поддержке." />
      <NotificationsList initialNotifications={notificationViews} />
    </div>
  )
}
