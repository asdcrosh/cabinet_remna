import Link from 'next/link'
import {
  AlertTriangle,
  BarChart3,
  CreditCard,
  Database,
  FileClock,
  LifeBuoy,
  Percent,
  RefreshCw,
  ServerCog,
  ShieldCheck,
  SlidersHorizontal,
  SearchCheck,
  Tag,
  TrendingUp,
  Users,
  UserPlus,
  Wallet,
} from 'lucide-react'
import { prisma } from '@/lib/prisma'
import { requireAdminPage } from '@/lib/auth/admin-page'
import { formatPrice } from '@/lib/format'
import { cn } from '@/lib/cn'
import { getPendingPaymentTtlMs } from '@/lib/payment-sync'
import { findIdentityDuplicateCandidates } from '@/lib/identity-duplicates'
import { PageHeader } from '@/components/dashboard/page-header'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Админка' }

export default async function AdminDashboardPage() {
  const { user } = await requireAdminPage()

  const now = new Date()
  const soon = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
  const todayStart = new Date(now)
  todayStart.setHours(0, 0, 0, 0)
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  const stalePaymentDate = new Date(now.getTime() - getPendingPaymentTtlMs())
  const twoWeeksAgo = new Date(now.getTime() - 13 * 24 * 60 * 60 * 1000)
  twoWeeksAgo.setHours(0, 0, 0, 0)
  const [
    usersTotal,
    usersToday,
    usersWeek,
    activeSubscriptions,
    recoveryCount,
    paymentsAggregate,
    paymentsToday,
    paymentsWeek,
    activePromoCodes,
    activePlans,
    supportWaiting,
    expiringSoon,
    auditEvents,
    payingUsersResult,
    sourceRows,
    dailyPaymentRows,
    dailyUserRows,
    stalePendingPayments,
    pendingPayments,
    syncFailed,
    duplicateCandidates,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { createdAt: { gte: todayStart } } }),
    prisma.user.count({ where: { createdAt: { gte: weekAgo } } }),
    prisma.subscription.count({ where: { status: { in: ['ACTIVE', 'LIMITED'] }, expireAt: { gt: now } } }),
    prisma.payment.count({ where: { status: 'SUCCEEDED', subscriptionProvisionedAt: null } }),
    prisma.payment.aggregate({
      where: { status: 'SUCCEEDED' },
      _sum: { amountKopecks: true },
      _count: true,
    }),
    prisma.payment.aggregate({
      where: {
        status: 'SUCCEEDED',
        OR: [
          { paidAt: { gte: todayStart } },
          { paidAt: null, createdAt: { gte: todayStart } },
        ],
      },
      _sum: { amountKopecks: true },
      _count: true,
    }),
    prisma.payment.aggregate({
      where: {
        status: 'SUCCEEDED',
        OR: [
          { paidAt: { gte: weekAgo } },
          { paidAt: null, createdAt: { gte: weekAgo } },
        ],
      },
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
    prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(DISTINCT p."userId")::bigint AS count
      FROM "Payment" p
      INNER JOIN "User" u ON u.id = p."userId"
      WHERE p.status = 'SUCCEEDED' AND u.role = 'USER'
    `,
    prisma.$queryRaw<Array<{ source: string; count: bigint }>>`
      WITH categorized AS (
        SELECT
          u.id,
          CASE
            WHEN u."telegramId" IS NOT NULL OR u.email LIKE 'telegram-%@pending.invalid%' THEN 'telegram'
            WHEN EXISTS (
              SELECT 1 FROM "OAuthAccount" oa
              WHERE oa."userId" = u.id AND lower(oa.provider) = 'google'
            ) THEN 'google'
            WHEN EXISTS (
              SELECT 1 FROM "OAuthAccount" oa
              WHERE oa."userId" = u.id AND lower(oa.provider) = 'yandex'
            ) THEN 'yandex'
            ELSE 'email'
          END AS source
        FROM "User" u
        WHERE u.role = 'USER'
      )
      SELECT source, COUNT(*)::bigint AS count
      FROM categorized
      GROUP BY source
    `,
    prisma.$queryRaw<Array<{ day: Date; payments: bigint; amount: bigint }>>`
      SELECT
        date_trunc('day', COALESCE(p."paidAt", p."createdAt"))::date AS day,
        COUNT(*)::bigint AS payments,
        COALESCE(SUM(p."amountKopecks"), 0)::bigint AS amount
      FROM "Payment" p
      WHERE p.status = 'SUCCEEDED'
        AND COALESCE(p."paidAt", p."createdAt") >= ${twoWeeksAgo}
      GROUP BY 1
      ORDER BY 1 ASC
    `,
    prisma.$queryRaw<Array<{ day: Date; users: bigint }>>`
      SELECT date_trunc('day', u."createdAt")::date AS day, COUNT(*)::bigint AS users
      FROM "User" u
      WHERE u."createdAt" >= ${twoWeeksAgo}
      GROUP BY 1
      ORDER BY 1 ASC
    `,
    prisma.payment.count({ where: { status: 'PENDING', createdAt: { lt: stalePaymentDate } } }),
    prisma.payment.count({ where: { status: 'PENDING' } }),
    prisma.syncEvent.count({ where: { status: 'FAILED' } }),
    findIdentityDuplicateCandidates(20),
  ])
  const customersTotal = sourceRows.reduce((sum, row) => sum + Number(row.count), 0)
  const payingUsers = Number(payingUsersResult[0]?.count ?? 0)
  const conversion = customersTotal > 0 ? (payingUsers / customersTotal) * 100 : 0
  const sourceCounts = {
    telegram: sourceCount(sourceRows, 'telegram'),
    google: sourceCount(sourceRows, 'google'),
    yandex: sourceCount(sourceRows, 'yandex'),
    email: sourceCount(sourceRows, 'email'),
  }
  const trendDays = buildTrendDays(twoWeeksAgo, now, dailyPaymentRows, dailyUserRows)

  return (
    <div className="page-stack">
      <PageHeader
        title="Обзор"
        description="Операционная сводка, риски и быстрые переходы по админке."
      />

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Требует внимания</h2>
          <p className="text-sm text-slate-500">Очереди и ошибки, которые влияют на пользователей</p>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <PriorityCard
          href="/dashboard/admin/support"
          icon={<LifeBuoy className="h-5 w-5" />}
          title="Поддержка"
          value={supportWaiting}
          text={supportWaiting > 0 ? 'Есть обращения без ответа' : 'Очередь чистая'}
          urgent={supportWaiting > 0}
        />
        <PriorityCard
          href="/dashboard/admin/recovery"
          icon={<Database className="h-5 w-5" />}
          title="Довыдача"
          value={recoveryCount}
          text={recoveryCount > 0 ? 'Нужно восстановить доступ' : 'Ошибок выдачи нет'}
          urgent={recoveryCount > 0}
        />
        <PriorityCard
          href="/dashboard/admin/remnashop-sync"
          icon={<RefreshCw className="h-5 w-5" />}
          title="Синхронизация"
          value={syncFailed}
          text={syncFailed > 0 ? 'Есть необработанные ошибки' : 'Ошибок синхронизации нет'}
          urgent={syncFailed > 0}
        />
        <PriorityCard
          href="/dashboard/admin/duplicates"
          icon={<SearchCheck className="h-5 w-5" />}
          title="Дубли"
          value={duplicateCandidates.length}
          text={duplicateCandidates.length > 0 ? 'Проверьте связанные аккаунты' : 'Подозрительных дублей нет'}
          urgent={duplicateCandidates.length > 0}
        />
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Рабочая сводка</h2>
            <p className="text-sm text-slate-500">Регистрации, платежи и источники пользователей</p>
          </div>
          <div className="text-xs text-slate-400">
            Обновлено {now.toLocaleString('ru-RU', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <AnalyticsCard
            icon={<UserPlus className="h-5 w-5" />}
            title="Регистрации"
            value={usersToday}
            hint="сегодня"
            details={[
              { label: 'За неделю', value: usersWeek },
              { label: 'Всего', value: usersTotal },
            ]}
          />
          <AnalyticsCard
            icon={<CreditCard className="h-5 w-5" />}
            title="Оплаты"
            value={paymentsToday._count}
            hint="сегодня"
            details={[
              { label: 'За неделю', value: paymentsWeek._count },
              { label: 'Всего', value: paymentsAggregate._count },
            ]}
          />
          <AnalyticsCard
            icon={<Wallet className="h-5 w-5" />}
            title="Выручка"
            value={formatPrice(paymentsToday._sum.amountKopecks ?? 0)}
            hint="сегодня"
            details={[
              { label: 'За неделю', value: formatPrice(paymentsWeek._sum.amountKopecks ?? 0) },
              { label: 'Всего', value: formatPrice(paymentsAggregate._sum.amountKopecks ?? 0) },
            ]}
          />
          <AnalyticsCard
            icon={<Percent className="h-5 w-5" />}
            title="Конверсия"
            value={`${conversion.toFixed(1)}%`}
            hint="регистрация → покупка"
            details={[
              { label: 'Покупателей', value: payingUsers },
              { label: 'Клиентов', value: customersTotal },
            ]}
          />
        </div>

        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.65fr)]">
          <div className="metric-card">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold">Источники пользователей</div>
                <div className="mt-0.5 text-xs text-slate-500">По текущим признакам аккаунта</div>
              </div>
              <BarChart3 className="h-5 w-5 text-slate-400" />
            </div>
            <div className="mt-4 space-y-3">
              <SourceLine label="Telegram" value={sourceCounts.telegram} total={customersTotal} className="bg-cyan-500" />
              <SourceLine label="Google" value={sourceCounts.google} total={customersTotal} className="bg-emerald-500" />
              <SourceLine label="Email" value={sourceCounts.email} total={customersTotal} className="bg-slate-500" />
              {sourceCounts.yandex > 0 && (
                <SourceLine label="Яндекс" value={sourceCounts.yandex} total={customersTotal} className="bg-amber-500" />
              )}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            <CompactMetric
              icon={<ShieldCheck className="h-5 w-5" />}
              label="Активные подписки"
              value={activeSubscriptions}
              hint={expiringSoon > 0 ? `${expiringSoon} истекают за 7 дней` : 'Без срочных окончаний'}
            />
            <CompactMetric
              icon={<TrendingUp className="h-5 w-5" />}
              label="Средний чек"
              value={formatPrice(paymentsAggregate._count > 0 ? Math.round((paymentsAggregate._sum.amountKopecks ?? 0) / paymentsAggregate._count) : 0)}
              hint="по успешным оплатам"
            />
            <CompactMetric
              icon={<FileClock className="h-5 w-5" />}
              label="Pending-платежи"
              value={pendingPayments}
              hint={pendingPayments > 0 ? 'ожидают оплаты' : 'нет ожидания'}
            />
            <CompactMetric
              icon={<AlertTriangle className="h-5 w-5" />}
              label="Зависшие оплаты"
              value={stalePendingPayments}
              hint={stalePendingPayments > 0 ? 'нужна сверка' : 'очередь чистая'}
            />
            <CompactMetric
              icon={<SearchCheck className="h-5 w-5" />}
              label="Возможные дубли"
              value={duplicateCandidates.length}
              hint={duplicateCandidates.length > 0 ? 'проверьте связи' : 'не найдено'}
            />
          </div>
        </div>

        <TrendPanel days={trendDays} />
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Быстрые разделы</h2>
          <p className="text-sm text-slate-500">Основные админские действия</p>
        </div>

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
          href="/dashboard/admin/payments"
          icon={<CreditCard className="h-5 w-5" />}
          title="Платежи"
          value={paymentsAggregate._count}
          note={`${formatPrice(paymentsAggregate._sum.amountKopecks ?? 0)} всего`}
        />
        <AdminTile
          href="/dashboard/admin/promo-codes"
          icon={<Tag className="h-5 w-5" />}
          title="Промокоды"
          value={activePromoCodes}
        />
        <AdminTile
          href="/dashboard/admin/remnashop-sync"
          icon={<RefreshCw className="h-5 w-5" />}
          title="Синхронизация"
          note="Remnashop"
        />
        <AdminTile
          href="/dashboard/admin/system"
          icon={<ServerCog className="h-5 w-5" />}
          title="Система"
          note="Health и бэкапы"
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
      </section>
    </div>
  )
}

function TrendPanel({
  days,
}: {
  days: Array<{ label: string; users: number; payments: number; amountKopecks: number }>
}) {
  const maxAmount = Math.max(1, ...days.map((day) => day.amountKopecks))
  const maxUsers = Math.max(1, ...days.map((day) => day.users))
  const totals = days.reduce(
    (acc, day) => {
      acc.users += day.users
      acc.payments += day.payments
      acc.amount += day.amountKopecks
      return acc
    },
    { users: 0, payments: 0, amount: 0 }
  )

  return (
    <div className="metric-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold">Динамика за 14 дней</div>
          <div className="mt-0.5 text-xs text-slate-500">
            {totals.users} регистраций · {totals.payments} оплат · {formatPrice(totals.amount)}
          </div>
        </div>
        <BarChart3 className="h-5 w-5 text-slate-400" />
      </div>
      <div className="mt-4 grid items-end gap-1.5 overflow-x-auto pb-1" style={{ gridTemplateColumns: 'repeat(14, minmax(2rem, 1fr))' }}>
        {days.map((day) => {
          const amountHeight = Math.max(8, Math.round((day.amountKopecks / maxAmount) * 84))
          const userHeight = Math.max(6, Math.round((day.users / maxUsers) * 42))
          return (
            <div key={day.label} className="flex min-w-8 flex-col items-center gap-1">
              <div className="flex h-24 items-end gap-0.5">
                <div
                  className="w-2 rounded-full bg-cyan-400"
                  style={{ height: day.amountKopecks > 0 ? amountHeight : 4 }}
                  title={`${day.label}: ${formatPrice(day.amountKopecks)}`}
                />
                <div
                  className="w-2 rounded-full bg-emerald-400"
                  style={{ height: day.users > 0 ? userHeight : 4 }}
                  title={`${day.label}: ${day.users} регистраций`}
                />
              </div>
              <div className="text-[10px] text-slate-400">{day.label}</div>
            </div>
          )
        })}
      </div>
      <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-500">
        <LegendDot className="bg-cyan-400" label="выручка" />
        <LegendDot className="bg-emerald-400" label="регистрации" />
      </div>
    </div>
  )
}

function LegendDot({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn('h-2 w-2 rounded-full', className)} />
      {label}
    </span>
  )
}

function AnalyticsCard({
  icon,
  title,
  value,
  hint,
  details,
}: {
  icon: React.ReactNode
  title: string
  value: React.ReactNode
  hint: string
  details: Array<{ label: string; value: React.ReactNode }>
}) {
  return (
    <div className="metric-card">
      <div className="flex items-start justify-between gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-cyan-200">
          {icon}
        </div>
        <div className="min-w-0 text-right">
          <div className="truncate text-sm font-medium text-slate-500">{title}</div>
          <div className="mt-1 text-2xl font-semibold tracking-tight">{value}</div>
          <div className="mt-0.5 text-xs text-slate-400">{hint}</div>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        {details.map((detail) => (
          <div key={detail.label} className="rounded-xl bg-slate-50 px-3 py-2 dark:bg-white/5">
            <div className="truncate text-[11px] uppercase text-slate-400">{detail.label}</div>
            <div className="mt-1 truncate text-sm font-semibold">{detail.value}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function CompactMetric({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode
  label: string
  value: React.ReactNode
  hint: string
}) {
  return (
    <div className="metric-card flex items-center gap-3">
      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-cyan-200">
        {icon}
      </div>
      <div className="min-w-0">
        <div className="truncate text-sm font-medium text-slate-500">{label}</div>
        <div className="mt-1 text-2xl font-semibold tracking-tight">{value}</div>
        <div className="mt-0.5 truncate text-xs text-slate-400">{hint}</div>
      </div>
    </div>
  )
}

function SourceLine({
  label,
  value,
  total,
  className,
}: {
  label: string
  value: number
  total: number
  className: string
}) {
  const percent = total > 0 ? (value / total) * 100 : 0
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-3 text-sm">
        <span className="font-medium">{label}</span>
        <span className="text-slate-500">{value} · {percent.toFixed(1)}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-white/10">
        <div className={cn('h-full rounded-full', className)} style={{ width: `${Math.max(percent, value > 0 ? 2 : 0)}%` }} />
      </div>
    </div>
  )
}

function sourceCount(rows: Array<{ source: string; count: bigint }>, source: string) {
  return Number(rows.find((row) => row.source === source)?.count ?? 0)
}

function buildTrendDays(
  start: Date,
  end: Date,
  payments: Array<{ day: Date; payments: bigint; amount: bigint }>,
  users: Array<{ day: Date; users: bigint }>
) {
  const paymentMap = new Map(
    payments.map((row) => [
      dayKey(row.day),
      { payments: Number(row.payments), amountKopecks: Number(row.amount) },
    ])
  )
  const userMap = new Map(users.map((row) => [dayKey(row.day), Number(row.users)]))
  const result: Array<{ label: string; users: number; payments: number; amountKopecks: number }> = []
  const cursor = new Date(start)

  while (cursor <= end && result.length < 14) {
    const key = dayKey(cursor)
    const payment = paymentMap.get(key)
    result.push({
      label: cursor.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' }),
      users: userMap.get(key) ?? 0,
      payments: payment?.payments ?? 0,
      amountKopecks: payment?.amountKopecks ?? 0,
    })
    cursor.setDate(cursor.getDate() + 1)
  }

  return result
}

function dayKey(date: Date) {
  return date.toISOString().slice(0, 10)
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
        'group flex min-h-32 min-w-0 flex-col justify-between rounded-2xl border bg-white/80 p-4 shadow-sm transition-colors hover:border-cyan-200 hover:bg-cyan-50/40 dark:bg-surface-900/80 dark:hover:border-cyan-500/30 dark:hover:bg-cyan-500/[0.06]',
        warning && 'border-amber-300 bg-amber-50/70 dark:border-amber-500/30 dark:bg-amber-500/10'
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className={cn(
          'grid h-9 w-9 place-items-center rounded-xl bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-cyan-200',
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

function PriorityCard({
  href,
  icon,
  title,
  value,
  text,
  urgent,
}: {
  href: string
  icon: React.ReactNode
  title: string
  value: number
  text: string
  urgent: boolean
}) {
  return (
    <Link
      href={href}
      className={cn(
        'metric-card group flex items-center justify-between gap-4 transition-colors hover:border-cyan-200 hover:bg-cyan-50/40 dark:hover:border-cyan-500/30 dark:hover:bg-cyan-500/[0.06]',
        urgent && 'border-amber-300 bg-amber-50/80 dark:border-amber-500/30 dark:bg-amber-500/10'
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        <div className={cn(
          'grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-cyan-200',
          urgent && 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-200'
        )}>
          {icon}
        </div>
        <div className="min-w-0">
          <div className="font-semibold text-slate-950 dark:text-white">{title}</div>
          <div className="mt-1 truncate text-sm text-slate-500 dark:text-slate-400">{text}</div>
        </div>
      </div>
      <div className="text-2xl font-semibold tracking-tight">{value}</div>
    </Link>
  )
}
