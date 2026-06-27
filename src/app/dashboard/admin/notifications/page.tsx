import { requireStaffPage } from '@/lib/auth/admin-page'
import { prisma } from '@/lib/prisma'
import { serializeAdminNotification } from '@/lib/admin-notifications'
import { AdminNotificationsList } from '@/components/admin/admin-notifications-list'

export default async function AdminNotificationsPage() {
  const { session } = await requireStaffPage()
  const notifications = await prisma.adminNotification.findMany({
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: { reads: { where: { userId: session.uid }, select: { readAt: true } } },
  })

  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-white/70 bg-white/85 p-5 shadow-sm shadow-slate-200/60 dark:border-white/10 dark:bg-surface-950/80 dark:shadow-black/20">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Администрирование</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950 dark:text-white">Уведомления</h1>
        <p className="mt-1 text-sm text-slate-500">Регистрации, оплаты, поддержка и важные события сервиса.</p>
      </section>
      <AdminNotificationsList initialNotifications={notifications.map(serializeAdminNotification)} />
    </div>
  )
}
