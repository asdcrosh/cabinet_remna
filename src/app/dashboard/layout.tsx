// Лэйаут кабинета: Sidebar + main. Защищаем на сервере.

import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth/cookies'
import { prisma } from '@/lib/prisma'
import { getBrandName } from '@/lib/branding'
import { getFeatureFlags } from '@/lib/feature-flags'
import { LogoutButton } from '@/components/dashboard/logout-button'
import { Brand, DashboardNav, MobileBottomNav, MobileDashboardNav } from '@/components/dashboard/dashboard-nav'
import { NotificationBell } from '@/components/dashboard/notification-bell'
import { logWarn } from '@/lib/logger'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getCurrentUser()
  if (!session) redirect('/login?next=/dashboard')
  const freshUser = await prisma.user.findUnique({
    where: { id: session.uid },
    select: { email: true, role: true, telegramUsername: true, telegramId: true },
  })
  if (!freshUser) {
    logWarn('auth.dashboard_layout.stale_session_redirect', { userId: session.uid })
    redirect('/login?next=/dashboard')
  }

  const role = freshUser.role
  const features = getFeatureFlags()
  const accountLabel = freshUser.email.endsWith('@pending.invalid')
    ? `@${freshUser.telegramUsername || freshUser.telegramId?.toString() || 'telegram'}`
    : freshUser.email
  const brandName = getBrandName()
  const [supportUnreadCount, adminSupportUnreadCount] = await Promise.all([
    prisma.supportTicket.aggregate({
      where: { userId: session.uid },
      _sum: { userUnreadCount: true },
    }),
    ['MODERATOR', 'ADMIN', 'SUPER_ADMIN'].includes(role)
      ? prisma.supportTicket.aggregate({
          where: { status: 'WAITING_ADMIN' },
          _sum: { adminUnreadCount: true },
        })
      : Promise.resolve({ _sum: { adminUnreadCount: 0 } }),
  ])
  const navBadges = {
    '/dashboard/support': supportUnreadCount._sum.userUnreadCount ?? 0,
    '/dashboard/admin/support': adminSupportUnreadCount._sum.adminUnreadCount ?? 0,
  }
  const isStaff = ['MODERATOR', 'ADMIN', 'SUPER_ADMIN'].includes(role)

  return (
    <div className="min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-40 hidden h-dvh w-72 flex-col overflow-hidden border-r border-white/70 bg-white/90 shadow-2xl shadow-slate-200/40 backdrop-blur-xl dark:border-white/10 dark:bg-surface-950/90 dark:shadow-black/25 lg:flex">
        <div className="shrink-0 px-5 py-4">
          <Brand brandName={brandName} />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-3 [scrollbar-gutter:stable]">
          <DashboardNav role={role} badges={navBadges} features={features} />
        </div>
        <div className="shrink-0 border-t border-white/70 bg-white/70 p-2.5 backdrop-blur dark:border-white/10 dark:bg-surface-950/70">
          <div className="mb-1.5 rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-1.5 text-xs text-slate-500 dark:border-slate-800 dark:bg-surface-900/80">
            <div className="truncate font-medium text-slate-700 dark:text-slate-200">{accountLabel}</div>
            <div>{roleLabel(role)}</div>
          </div>
          <LogoutButton />
        </div>
      </aside>
      <main className="min-w-0 w-full overflow-x-clip lg:ml-72 lg:w-auto">
        <div className="sticky top-0 z-30 hidden h-14 items-center justify-end border-b border-white/70 bg-white/80 px-6 shadow-sm shadow-slate-200/60 backdrop-blur-xl dark:border-white/10 dark:bg-surface-950/80 dark:shadow-black/20 lg:flex">
          <div className="flex items-center gap-2">
            <NotificationBell showAdmin={isStaff} />
          </div>
        </div>
        <div className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-white/70 bg-white/80 px-4 shadow-sm shadow-slate-200/60 backdrop-blur-xl dark:border-white/10 dark:bg-surface-950/80 dark:shadow-black/20 lg:hidden">
          <Brand compact brandName={brandName} />
          <div className="flex items-center gap-2">
            <NotificationBell showAdmin={isStaff} />
            <MobileDashboardNav role={role} email={accountLabel} brandName={brandName} badges={navBadges} features={features} />
          </div>
        </div>
        <div className="page-transition mx-auto w-full max-w-6xl min-w-0 px-4 pb-24 pt-4 sm:px-6 sm:pt-6 lg:px-8 lg:py-8">{children}</div>
      </main>
      <MobileBottomNav badges={navBadges} features={features} />
    </div>
  )
}

function roleLabel(role: 'USER' | 'MODERATOR' | 'ADMIN' | 'SUPER_ADMIN') {
  if (role === 'SUPER_ADMIN') return 'Главный администратор'
  if (role === 'ADMIN') return 'Администратор'
  if (role === 'MODERATOR') return 'Модератор поддержки'
  return 'Аккаунт пользователя'
}
