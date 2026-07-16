import { requireStaffPage } from '@/lib/auth/admin-page'
import { prisma } from '@/lib/prisma'
import { serializeAdminNotification } from '@/lib/admin-notifications'
import { AdminNotificationsList } from '@/components/admin/admin-notifications-list'
import { AdminPageShell } from '@/components/admin/admin-page-shell'

export default async function AdminNotificationsPage() {
  const { session } = await requireStaffPage()
  const notifications = await prisma.adminNotification.findMany({
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: { reads: { where: { userId: session.uid }, select: { readAt: true } } },
  })

  return (
    <AdminPageShell
      title="Уведомления"
      description="События кабинета и системы"
    >
      <AdminNotificationsList initialNotifications={notifications.map(serializeAdminNotification)} />
    </AdminPageShell>
  )
}
