import Link from 'next/link'
import {
  AlertTriangle,
  ArrowRight,
  CreditCard,
  Database,
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
import { PageHeader } from '@/components/dashboard/page-header'
import { StatCard } from '@/components/dashboard/stat-card'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Админка' }

export default async function AdminDashboardPage() {
  await requireAdminPage()

  const now = new Date()
  const soon = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)

  const [usersTotal, activeSubscriptions, recoveryCount, paymentsAggregate, activePromoCodes, activePlans, supportWaiting] = await Promise.all([
    prisma.user.count(),
    prisma.subscription.count({ where: { status: { in: ['ACTIVE', 'LIMITED'] } } }),
    prisma.payment.count({ where: { status: 'SUCCEEDED', subscriptionProvisionedAt: null } }),
    prisma.payment.aggregate({
      where: { status: 'SUCCEEDED' },
      _sum: { amountKopecks: true },
      _count: true,
    }),
    prisma.promoCode.count({ where: { isActive: true } }),
    prisma.plan.count({ where: { isActive: true } }),
    prisma.supportTicket.count({ where: { status: 'WAITING_ADMIN' } }),
  ])

  const expiringSoon = await prisma.subscription.count({
    where: { status: { in: ['ACTIVE', 'LIMITED'] }, expireAt: { gte: now, lte: soon } },
  })

  return (
    <div className="space-y-6">
      <PageHeader
        title="Админка"
        description="Операционная сводка по пользователям, оплатам и подпискам"
        action={recoveryCount > 0 ? <Link href="/dashboard/admin/recovery" className="btn-primary">Проверить довыдачу</Link> : undefined}
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-6">
        <StatCard label="Пользователи" value={usersTotal} hint="всего аккаунтов" icon={<Users className="h-5 w-5" />} />
        <StatCard
          label="Тарифы"
          value={activePlans}
          hint="опубликованы"
          icon={<ShieldCheck className="h-5 w-5" />}
        />
        <StatCard
          label="Активные подписки"
          value={activeSubscriptions}
          hint={`${expiringSoon} истекают за 7 дней`}
          icon={<Database className="h-5 w-5" />}
        />
        <StatCard
          label="Успешные оплаты"
          value={paymentsAggregate._count}
          hint={formatPrice(paymentsAggregate._sum.amountKopecks ?? 0)}
          icon={<CreditCard className="h-5 w-5" />}
        />
        <StatCard
          label="Довыдача"
          value={recoveryCount}
          hint={recoveryCount > 0 ? 'нужна довыдача' : 'очередь пуста'}
          icon={<AlertTriangle className="h-5 w-5" />}
          className={recoveryCount > 0 ? 'border-amber-300 bg-amber-50/50 dark:bg-amber-500/10' : undefined}
        />
        <StatCard
          label="Промокоды"
          value={activePromoCodes}
          hint="активных кодов"
          icon={<Tag className="h-5 w-5" />}
        />
      </div>

      <div>
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Управление</h2>
            <p className="text-sm text-slate-500">Основные рабочие разделы кабинета</p>
          </div>
          {supportWaiting > 0 && <span className="badge-limited">{supportWaiting} обращений ждут ответа</span>}
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <AdminQuickLink icon={<Users className="h-5 w-5" />} href="/dashboard/admin/users" title="Пользователи" description="Роли, профили и подписки" />
          <AdminQuickLink icon={<SlidersHorizontal className="h-5 w-5" />} href="/dashboard/admin/plans" title="Тарифы" description="Цены, лимиты и группы" />
          <AdminQuickLink icon={<CreditCard className="h-5 w-5" />} href="/dashboard/admin/payments" title="Платежи" description="Оплаты, статусы и выдача" />
          <AdminQuickLink icon={<Tag className="h-5 w-5" />} href="/dashboard/admin/promo-codes" title="Промокоды" description="Скидки и ограничения" />
          <AdminQuickLink icon={<Database className="h-5 w-5" />} href="/dashboard/admin/subscriptions" title="Подписки" description="Сроки, трафик и синхронизация" />
          <AdminQuickLink icon={<LifeBuoy className="h-5 w-5" />} href="/dashboard/admin/support" title="Поддержка" description={supportWaiting > 0 ? `${supportWaiting} обращений требуют ответа` : 'Очередь обращений пуста'} />
          <AdminQuickLink icon={<RefreshCw className="h-5 w-5" />} href="/dashboard/admin/remnashop-sync" title="Синхронизация" description="Каталог Remnashop и промокоды" />
          {recoveryCount > 0 && <AdminQuickLink icon={<AlertTriangle className="h-5 w-5" />} href="/dashboard/admin/recovery" title="Довыдача" description={`${recoveryCount} оплат требуют внимания`} warning />}
        </div>
      </div>
    </div>
  )
}

function AdminQuickLink({
  href,
  title,
  description,
  icon,
  warning = false,
}: {
  href: string
  title: string
  description: string
  icon: React.ReactNode
  warning?: boolean
}) {
  return (
    <Link href={href} className={warning ? 'card group flex items-center gap-4 border-amber-300 bg-amber-50/60 transition-all hover:-translate-y-0.5 dark:bg-amber-500/10' : 'card group flex items-center gap-4 transition-all hover:-translate-y-0.5 hover:shadow-md'}>
      <div className={warning ? 'grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-200' : 'grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-cyan-200'}>
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="font-semibold">{title}</div>
        <p className="mt-0.5 truncate text-sm text-slate-500">{description}</p>
      </div>
      <ArrowRight className="h-4 w-4 shrink-0 text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:text-slate-600" />
    </Link>
  )
}
