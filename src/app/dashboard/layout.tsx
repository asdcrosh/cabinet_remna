// Лэйаут кабинета: Sidebar + main. Защищаем на сервере.

import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth/cookies'
import { prisma } from '@/lib/prisma'
import { maybeSyncRemnashopCatalog } from '@/lib/remnashop-sync'
import { LogoutButton } from '@/components/dashboard/logout-button'
import { Brand, DashboardNav, MobileDashboardNav } from '@/components/dashboard/dashboard-nav'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getCurrentUser()
  if (!session) redirect('/login?next=/dashboard')
  const freshUser = await prisma.user.findUnique({
    where: { id: session.uid },
    select: { email: true, role: true },
  })
  if (!freshUser) redirect('/login?next=/dashboard')

  try {
    await maybeSyncRemnashopCatalog()
  } catch (error) {
    console.warn('[remnashop-sync] auto catalog sync skipped', error)
  }

  const role = freshUser.role
  const email = freshUser.email

  return (
    <div className="min-h-screen lg:flex">
      <aside className="sticky top-0 hidden h-screen w-72 shrink-0 flex-col border-r border-white/70 bg-white/80 shadow-2xl shadow-slate-200/40 backdrop-blur-xl dark:border-white/10 dark:bg-surface-950/70 dark:shadow-black/25 lg:flex">
        <div className="px-6 py-5">
          <Brand />
        </div>
        <div className="flex-1 px-3">
          <DashboardNav role={role} />
        </div>
        <div className="border-t border-white/70 p-3 dark:border-white/10">
          <div className="mb-2 rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2 text-xs text-slate-500 dark:border-slate-800 dark:bg-surface-900/80">
            <div className="truncate font-medium text-slate-700 dark:text-slate-200">{email}</div>
            <div>{role === 'ADMIN' ? 'Аккаунт администратора' : 'Аккаунт пользователя'}</div>
          </div>
          <LogoutButton />
        </div>
      </aside>
      <main className="min-w-0 flex-1">
        <div className="sticky top-0 z-30 flex items-center justify-between border-b border-white/70 bg-white/80 px-4 py-3 shadow-sm shadow-slate-200/60 backdrop-blur-xl dark:border-white/10 dark:bg-surface-950/80 dark:shadow-black/20 lg:hidden">
          <Brand compact />
          <MobileDashboardNav role={role} email={email} />
        </div>
        <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</div>
      </main>
    </div>
  )
}
