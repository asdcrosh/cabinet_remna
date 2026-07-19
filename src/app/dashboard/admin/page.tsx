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
  ShieldCheck,
  SearchCheck,
  TrendingUp,
  UserPlus,
  Wallet,
} from 'lucide-react'
import { prisma } from '@/lib/prisma'
import { requireAdminPage } from '@/lib/auth/admin-page'
import { formatPrice } from '@/lib/format'
import { cn } from '@/lib/cn'
import { getPendingPaymentTtlMs } from '@/lib/payment-sync'
import { findIdentityDuplicateCandidates } from '@/lib/identity-duplicates'
import { AdminPageShell } from '@/components/admin/admin-page-shell'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Админка' }

export default async function AdminDashboardPage() {
  await requireAdminPage()

  const now = new Date()
  const soon = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
  const todayStart = new Date(now)
  todayStart.setHours(0, 0, 0, 0)
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
    supportWaiting,
    expiringSoon,
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
    prisma.supportTicket.count({ where: { status: 'WAITING_ADMIN' } }),
    prisma.subscription.count({
      where: { status: { in: ['ACTIVE', 'LIMITED'] }, expireAt: { gte: now, lte: soon } },
    }),
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
  const updatedAt = now.toLocaleString('ru-RU', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })

  return (
    <AdminPageShell
      title="Обзор"
      description="Показатели и задачи кабинета"
      action={(
        <div className="inline-flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-xs text-slate-500 shadow-sm ring-1 ring-slate-200/80 dark:bg-white/[0.045] dark:text-slate-300 dark:ring-white/10">
          <span className="h-2 w-2 rounded-full bg-emerald-500" />
          <span>Обновлено {updatedAt}</span>
        </div>
      )}
    >
      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-slate-950 dark:text-white">Требует внимания</h2>
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">Очереди для ручной проверки</p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {supportWaiting > 0 && (
            <PriorityCard href="/dashboard/admin/support" icon={<LifeBuoy className="h-4 w-4" />} title="Поддержка" value={supportWaiting} text="Обращения без ответа" />
          )}
          {recoveryCount > 0 && (
            <PriorityCard href="/dashboard/admin/recovery" icon={<Database className="h-4 w-4" />} title="Довыдача" value={recoveryCount} text="Не выданы подписки" />
          )}
          {syncFailed > 0 && (
            <PriorityCard href="/dashboard/admin/remnashop-sync" icon={<RefreshCw className="h-4 w-4" />} title="Синхронизация" value={syncFailed} text="Необработанные ошибки" />
          )}
          {duplicateCandidates.length > 0 && (
            <PriorityCard href="/dashboard/admin/duplicates" icon={<SearchCheck className="h-4 w-4" />} title="Дубли" value={duplicateCandidates.length} text="Нужна ручная проверка" />
          )}
          {supportWaiting === 0 && recoveryCount === 0 && syncFailed === 0 && duplicateCandidates.length === 0 && (
            <div className="col-span-full flex min-h-16 items-center gap-3 rounded-[1.25rem] border border-emerald-200/80 bg-emerald-50/80 px-4 py-3 text-sm font-medium text-emerald-800 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-200">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/80 text-emerald-600 shadow-sm ring-1 ring-emerald-200/80 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/20">
                <ShieldCheck className="h-4 w-4" />
              </span>
              <div>
                <div className="font-semibold">Очереди чистые</div>
                <div className="mt-0.5 text-xs font-normal text-emerald-700/80 dark:text-emerald-300/80">Срочных действий нет</div>
              </div>
            </div>
          )}
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-slate-950 dark:text-white">Рабочая сводка</h2>
            <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">Регистрации, платежи и источники пользователей</p>
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
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
          <div className="min-w-0 rounded-[1.5rem] border border-slate-200/80 bg-white p-4 dark:border-white/[0.08] dark:bg-white/[0.025] sm:p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold">Источники пользователей</div>
                <div className="mt-0.5 text-xs text-slate-500">По текущим признакам аккаунта</div>
              </div>
              <div className="inline-flex items-center gap-2 rounded-xl bg-slate-50 px-2.5 py-1.5 text-sm font-semibold tabular-nums text-slate-700 ring-1 ring-slate-200/70 dark:bg-white/[0.045] dark:text-slate-200 dark:ring-white/10">
                <BarChart3 className="h-4 w-4 text-slate-400" />
                {customersTotal}
              </div>
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

          <div className="overflow-hidden rounded-[1.5rem] border border-slate-200/80 bg-white divide-y divide-slate-100 dark:divide-white/[0.08] dark:border-white/[0.08] dark:bg-white/[0.025]">
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
    </AdminPageShell>
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
    <div className="min-w-0 rounded-[1.5rem] border border-slate-200/80 bg-white p-4 dark:border-white/[0.08] dark:bg-white/[0.025] sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold">Динамика за 14 дней</div>
          <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">Ежедневная выручка и новые аккаунты</div>
        </div>
        <BarChart3 className="h-5 w-5 text-slate-400" aria-hidden="true" />
      </div>
      <div className="mt-3 flex flex-wrap gap-2 text-xs">
        <TrendTotal label="Регистрации" value={totals.users} />
        <TrendTotal label="Оплаты" value={totals.payments} />
        <TrendTotal label="Выручка" value={formatPrice(totals.amount)} />
      </div>
      <div className="mt-4 overflow-x-auto pb-1">
        <div className="grid min-w-[32rem] items-end gap-1.5" style={{ gridTemplateColumns: 'repeat(14, minmax(2rem, 1fr))' }}>
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
                <div className="text-[10px] tabular-nums text-slate-400">{day.label}</div>
              </div>
            )
          })}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-500 dark:text-slate-400">
        <LegendDot className="bg-cyan-400" label="выручка" />
        <LegendDot className="bg-emerald-400" label="регистрации" />
      </div>
    </div>
  )
}

function TrendTotal({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-50 px-2.5 py-1.5 text-slate-500 ring-1 ring-slate-200/70 dark:bg-white/[0.04] dark:text-slate-400 dark:ring-white/[0.08]">
      {label}
      <strong className="font-semibold tabular-nums text-slate-800 dark:text-slate-100">{value}</strong>
    </span>
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
    <div className="min-w-0 rounded-[1.25rem] border border-slate-200/80 bg-white p-4 dark:border-white/[0.08] dark:bg-white/[0.025]">
      <div className="flex items-center justify-between gap-3">
        <div className="inline-flex min-w-0 items-center gap-2.5 text-sm font-medium text-slate-500 dark:text-slate-400">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-slate-50 text-slate-400 ring-1 ring-slate-200/70 dark:bg-white/[0.04] dark:ring-white/[0.08]">{icon}</span>
          <span className="truncate">{title}</span>
        </div>
        <div className="shrink-0 rounded-lg bg-slate-50 px-2 py-1 text-[11px] font-medium text-slate-400 dark:bg-white/[0.04]">{hint}</div>
      </div>
      <div className="mt-3 truncate text-2xl font-semibold tracking-tight tabular-nums text-slate-950 dark:text-white">{value}</div>
      <div className="mt-3 grid grid-cols-2 gap-2 border-t border-slate-100 pt-3 text-xs text-slate-500 dark:border-white/[0.07] dark:text-slate-400">
        {details.map((detail) => (
          <span key={detail.label} className="min-w-0">
            <span className="block truncate">{detail.label}</span>
            <strong className="mt-0.5 block truncate font-semibold tabular-nums text-slate-700 dark:text-slate-200">{detail.value}</strong>
          </span>
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
    <div className="flex min-h-16 items-center gap-3 px-4 py-3">
      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-slate-50 text-slate-400 ring-1 ring-slate-200/70 dark:bg-white/[0.04] dark:ring-white/[0.08]">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{label}</div>
        <div className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">{hint}</div>
      </div>
      <div className="max-w-[45%] shrink-0 truncate text-lg font-semibold tracking-tight tabular-nums text-slate-950 dark:text-white">{value}</div>
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
        <span className="tabular-nums text-slate-500 dark:text-slate-400">{value} · {percent.toFixed(1)}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-white/[0.08]">
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

function PriorityCard({
  href,
  icon,
  title,
  value,
  text,
}: {
  href: string
  icon: React.ReactNode
  title: string
  value: number
  text: string
}) {
  return (
    <Link
      href={href}
      className="group flex min-h-16 items-center justify-between gap-3 rounded-[1.25rem] border border-amber-200/80 bg-amber-50/70 px-3.5 py-3 transition-colors hover:border-amber-300 hover:bg-amber-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/60 dark:border-amber-500/20 dark:bg-amber-500/10 dark:hover:border-amber-500/35"
    >
      <div className="flex min-w-0 items-center gap-3">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/80 text-amber-700 shadow-sm ring-1 ring-amber-200/80 dark:bg-amber-500/10 dark:text-amber-200 dark:ring-amber-500/20">
          {icon}
        </div>
        <div className="min-w-0">
          <div className="font-semibold text-slate-950 dark:text-white">{title}</div>
          <div className="truncate text-xs text-slate-500 dark:text-slate-400">{text}</div>
        </div>
      </div>
      <div className="shrink-0 rounded-xl bg-white/80 px-2.5 py-1 text-lg font-semibold tracking-tight tabular-nums text-slate-950 shadow-sm ring-1 ring-amber-200/70 dark:bg-white/[0.05] dark:text-white dark:ring-amber-500/20">{value}</div>
    </Link>
  )
}
