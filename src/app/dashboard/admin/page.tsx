import Link from 'next/link'
import {
  AlertTriangle,
  CreditCard,
  Database,
  FileClock,
  LifeBuoy,
  RefreshCw,
  ShieldCheck,
  SlidersHorizontal,
  Tag,
  Users,
} from 'lucide-react'
import { prisma } from '@/lib/prisma'
import { requireAdminPage } from '@/lib/auth/admin-page'
import { formatPrice } from '@/lib/format'
import { cn } from '@/lib/cn'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Админка' }

export default async function AdminDashboardPage() {
  const { user } = await requireAdminPage()

  const now = new Date()
  const soon = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  const [
    usersTotal,
    usersWeek,
    activeSubscriptions,
    recoveryCount,
    paymentsAggregate,
    paymentsDay,
    activePromoCodes,
    activePlans,
    supportWaiting,
    expiringSoon,
    auditEvents,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { createdAt: { gte: weekAgo } } }),
    prisma.subscription.count({ where: { status: { in: ['ACTIVE', 'LIMITED'] } } }),
    prisma.payment.count({ where: { status: 'SUCCEEDED', subscriptionProvisionedAt: null } }),
    prisma.payment.aggregate({
      where: { status: 'SUCCEEDED' },
      _sum: { amountKopecks: true },
      _count: true,
    }),
    prisma.payment.aggregate({
      where: { status: 'SUCCEEDED', createdAt: { gte: dayAgo } },
      _sum: { amountKopecks: true },
      _count: true,
    }),
    prisma.promoCode.count({ where: { isActive: true } }),
    prisma.plan.count({ where: { isActive: true } }),
    prisma.supportTicket.count({ where: { status: 'WAITING_ADMIN' } }),
    prisma.subscription.count({
      where: { status: { in: ['ACTIVE', 'LIMITED'] }, expireAt: { gte: now, lte: soon } },
    }),
    user.role === 'SUPER_ADMIN'
      ? prisma.auditLog.count({ where: { createdAt: { gte: dayAgo } } })
      : Promise.resolve(0),
  ])

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Обзор</h1>
        <p className="mt-1 text-sm text-slate-500">Краткая сводка и быстрые переходы</p>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6">
        <AdminTile
          href="/dashboard/admin/users"
          icon={<Users className="h-5 w-5" />}
          title="Пользователи"
          value={usersTotal}
          note={usersWeek > 0 ? `+${usersWeek} за неделю` : undefined}
        />
        <AdminTile
          href="/dashboard/admin/plans"
          icon={<SlidersHorizontal className="h-5 w-5" />}
          title="Тарифы"
          value={activePlans}
        />
        <AdminTile
          href="/dashboard/admin/subscriptions"
          icon={<ShieldCheck className="h-5 w-5" />}
          title="Подписки"
          value={activeSubscriptions}
          note={expiringSoon > 0 ? `${expiringSoon} скоро истекут` : undefined}
        />
        <AdminTile
          href="/dashboard/admin/payments"
          icon={<CreditCard className="h-5 w-5" />}
          title="Платежи"
          value={paymentsAggregate._count}
          note={`${formatPrice(paymentsAggregate._sum.amountKopecks ?? 0)} всего`}
        />
        <AdminTile
          href="/dashboard/admin/payments"
          icon={<CreditCard className="h-5 w-5" />}
          title="За 24 часа"
          value={paymentsDay._count}
          note={formatPrice(paymentsDay._sum.amountKopecks ?? 0)}
        />
        <AdminTile
          href="/dashboard/admin/promo-codes"
          icon={<Tag className="h-5 w-5" />}
          title="Промокоды"
          value={activePromoCodes}
        />
        <AdminTile
          href="/dashboard/admin/support"
          icon={<LifeBuoy className="h-5 w-5" />}
          title="Поддержка"
          value={supportWaiting}
          warning={supportWaiting > 0}
          note={supportWaiting > 0 ? 'Ждут ответа' : 'Очередь пуста'}
        />
        <AdminTile
          href="/dashboard/admin/remnashop-sync"
          icon={<RefreshCw className="h-5 w-5" />}
          title="Синхронизация"
          note="Remnashop"
        />
        <AdminTile
          href="/dashboard/admin/recovery"
          icon={recoveryCount > 0 ? <AlertTriangle className="h-5 w-5" /> : <Database className="h-5 w-5" />}
          title="Довыдача"
          value={recoveryCount}
          warning={recoveryCount > 0}
          note={recoveryCount > 0 ? 'Требует внимания' : 'Очередь пуста'}
        />
        {user.role === 'SUPER_ADMIN' && (
          <AdminTile
            href="/dashboard/admin/audit"
            icon={<FileClock className="h-5 w-5" />}
            title="История"
            value={auditEvents}
            note="За 24 часа"
          />
        )}
      </div>
    </div>
  )
}

function AdminTile({
  href,
  icon,
  title,
  value,
  note,
  warning = false,
}: {
  href: string
  icon: React.ReactNode
  title: string
  value?: React.ReactNode
  note?: string
  warning?: boolean
}) {
  return (
    <Link
      href={href}
      className={cn(
        'group flex min-h-32 min-w-0 flex-col justify-between rounded-lg border bg-white/80 p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md dark:bg-surface-900/80 dark:hover:border-white/20',
        warning && 'border-amber-300 bg-amber-50/70 dark:border-amber-500/30 dark:bg-amber-500/10'
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className={cn(
          'grid h-9 w-9 place-items-center rounded-lg bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-cyan-200',
          warning && 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-200'
        )}>
          {icon}
        </div>
        {value !== undefined && <div className="text-2xl font-semibold tracking-tight">{value}</div>}
      </div>
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold">{title}</div>
        {note && <div className="mt-0.5 truncate text-xs text-slate-500">{note}</div>}
      </div>
    </Link>
  )
}
