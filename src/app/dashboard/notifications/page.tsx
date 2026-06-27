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

  return (
    <div className="space-y-6">
      <PageHeader title="Уведомления" description="Платежи, подписка, поддержка и бонусы в одном месте." />
      <NotificationsList initialNotifications={notifications.map(serializeUserNotification)} />
    </div>
  )
}
