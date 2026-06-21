import Link from 'next/link'
import { AlertTriangle, CreditCard, Database, Tag, Users } from 'lucide-react'
import { prisma } from '@/lib/prisma'
import { requireAdminPage } from '@/lib/auth/admin-page'
import { formatPrice } from '@/lib/format'
import { PageHeader } from '@/components/dashboard/page-header'
import { StatCard } from '@/components/dashboard/stat-card'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Админка — Remnawave Cabinet' }

export default async function AdminDashboardPage() {
  await requireAdminPage()

  const now = new Date()
  const soon = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)

  const [usersTotal, activeSubscriptions, recoveryCount, paymentsAggregate, activePromoCodes] = await Promise.all([
    prisma.user.count(),
    prisma.subscription.count({ where: { status: { in: ['ACTIVE', 'LIMITED'] } } }),
    prisma.payment.count({ where: { status: 'SUCCEEDED', subscriptionProvisionedAt: null } }),
    prisma.payment.aggregate({
      where: { status: 'SUCCEEDED' },
      _sum: { amountKopecks: true },
      _count: true,
    }),
    prisma.promoCode.count({ where: { isActive: true } }),
  ])

  const expiringSoon = await prisma.subscription.count({
    where: { status: { in: ['ACTIVE', 'LIMITED'] }, expireAt: { gte: now, lte: soon } },
  })

  return (
    <div className="space-y-6">
      <PageHeader
        title="Админка"
        description="Операционная сводка по пользователям, оплатам и подпискам"
        action={<Link href="/dashboard/admin/recovery" className="btn-primary">Recovery</Link>}
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-5">
        <StatCard label="Пользователи" value={usersTotal} hint="всего аккаунтов" icon={<Users className="h-5 w-5" />} />
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
          label="Recovery"
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

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <AdminQuickLink href="/dashboard/admin/users" title="Пользователи" description="Поиск, роли, Remnawave-профили" />
        <AdminQuickLink href="/dashboard/admin/payments" title="Платежи" description="История оплат и выдачи подписок" />
        <AdminQuickLink href="/dashboard/admin/promo-codes" title="Промокоды" description="Скидки, лимиты и тарифы" />
        <AdminQuickLink href="/dashboard/admin/subscriptions" title="Подписки" description="Статусы, сроки и локальная синхронизация" />
      </div>
    </div>
  )
}

function AdminQuickLink({ href, title, description }: { href: string; title: string; description: string }) {
  return (
    <Link href={href} className="card block transition-all hover:-translate-y-0.5 hover:shadow-md">
      <div className="font-semibold">{title}</div>
      <p className="mt-1 text-sm text-slate-500">{description}</p>
    </Link>
  )
}
