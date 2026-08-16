import Link from 'next/link'
import {
  BarChart3,
  CreditCard,
  Database,
  FileClock,
  LifeBuoy,
  Percent,
  RefreshCw,
  ShieldCheck,
  SearchCheck,
  TriangleAlert,
  UserPlus,
  Wallet,
} from 'lucide-react'
import { prisma } from '@/lib/prisma'
import { requireAdminPage } from '@/lib/auth/admin-page'
import { formatPrice } from '@/lib/format'
import { cn } from '@/lib/cn'
import { getPendingPaymentTtlMs } from '@/lib/payment-sync'
import { findIdentityDuplicateCandidates } from '@/lib/identity-duplicates'
import { logError } from '@/lib/logger'
import { AdminPageShell } from '@/components/admin/admin-page-shell'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Админка' }

export default async function AdminDashboardPage() {
  await requireAdminPage()

  const now = new Date()
  const todayStart = new Date(now)
  todayStart.setHours(0, 0, 0, 0)
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  const stalePaymentDate = new Date(now.getTime() - getPendingPaymentTtlMs())
  const twoWeeksAgo = new Date(now.getTime() - 13 * 24 * 60 * 60 * 1000)
  twoWeeksAgo.setHours(0, 0, 0, 0)
  const failedMetrics: string[] = []
  const [
    usersTotal,
    usersToday,
    usersWeek,
    recoveryCount,
    paymentsAggregate,
    paymentsToday,
    paymentsWeek,
    supportWaiting,
    payingUsersResult,
    customersTotal,
    dailyPaymentRows,
    dailyUserRows,
    stalePendingPayments,
    syncFailed,
    duplicateCandidates,
  ] = await Promise.all([
    loadAdminMetric('Пользователи: всего', prisma.user.count(), 0, failedMetrics),
    loadAdminMetric('Пользователи: сегодня', prisma.user.count({ where: { createdAt: { gte: todayStart } } }), 0, failedMetrics),
    loadAdminMetric('Пользователи: неделя', prisma.user.count({ where: { createdAt: { gte: weekAgo } } }), 0, failedMetrics),
    loadAdminMetric('Довыдача подписок', prisma.payment.count({ where: { status: 'SUCCEEDED', subscriptionProvisionedAt: null } }), 0, failedMetrics),
    loadAdminMetric('Оплаты: всего', prisma.payment.aggregate({
      where: { status: 'SUCCEEDED' },
      _sum: { amountKopecks: true },
      _count: true,
    }), { _sum: { amountKopecks: null }, _count: 0 }, failedMetrics),
    loadAdminMetric('Оплаты: сегодня', prisma.payment.aggregate({
      where: {
        status: 'SUCCEEDED',
        OR: [
          { paidAt: { gte: todayStart } },
          { paidAt: null, createdAt: { gte: todayStart } },
        ],
      },
      _sum: { amountKopecks: true },
      _count: true,
    }), { _sum: { amountKopecks: null }, _count: 0 }, failedMetrics),
    loadAdminMetric('Оплаты: неделя', prisma.payment.aggregate({
      where: {
        status: 'SUCCEEDED',
        OR: [
          { paidAt: { gte: weekAgo } },
          { paidAt: null, createdAt: { gte: weekAgo } },
        ],
      },
      _sum: { amountKopecks: true },
      _count: true,
    }), { _sum: { amountKopecks: null }, _count: 0 }, failedMetrics),
    loadAdminMetric('Поддержка', prisma.supportTicket.count({ where: { status: 'WAITING_ADMIN' } }), 0, failedMetrics),
    loadAdminMetric('Платящие пользователи', prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(DISTINCT p."userId")::bigint AS count
      FROM "Payment" p
      INNER JOIN "User" u ON u.id = p."userId"
      WHERE p.status = 'SUCCEEDED' AND u.role = 'USER'
    `, [], failedMetrics),
    loadAdminMetric('Клиенты', prisma.user.count({ where: { role: 'USER' } }), 0, failedMetrics),
    loadAdminMetric('График оплат', prisma.$queryRaw<Array<{ day: Date; payments: bigint; amount: bigint }>>`
      SELECT
        date_trunc('day', COALESCE(p."paidAt", p."createdAt"))::date AS day,
        COUNT(*)::bigint AS payments,
        COALESCE(SUM(p."amountKopecks"), 0)::bigint AS amount
      FROM "Payment" p
      WHERE p.status = 'SUCCEEDED'
        AND COALESCE(p."paidAt", p."createdAt") >= ${twoWeeksAgo}
      GROUP BY 1
      ORDER BY 1 ASC
    `, [], failedMetrics),
    loadAdminMetric('График регистраций', prisma.$queryRaw<Array<{ day: Date; users: bigint }>>`
      SELECT date_trunc('day', u."createdAt")::date AS day, COUNT(*)::bigint AS users
      FROM "User" u
      WHERE u."createdAt" >= ${twoWeeksAgo}
      GROUP BY 1
      ORDER BY 1 ASC
    `, [], failedMetrics),
    loadAdminMetric('Зависшие оплаты', prisma.payment.count({ where: { status: 'PENDING', createdAt: { lt: stalePaymentDate } } }), 0, failedMetrics),
    loadAdminMetric('Ошибки синхронизации', prisma.syncEvent.count({ where: { status: 'FAILED' } }), 0, failedMetrics),
    loadAdminMetric('Дубли аккаунтов', findIdentityDuplicateCandidates(20), [], failedMetrics),
  ])
  const payingUsers = Number(payingUsersResult[0]?.count ?? 0)
  const conversion = customersTotal > 0 ? (payingUsers / customersTotal) * 100 : 0
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
        <div className="inline-flex items-center gap-2 text-xs text-slate-500 dark:text-slate-300">
          <span className="h-2 w-2 rounded-full bg-emerald-500" />
          <span>Обновлено {updatedAt}</span>
        </div>
      )}
    >
      {failedMetrics.length > 0 ? (
        <section className="flex items-start gap-3 rounded-[12px] border border-amber-300 bg-amber-50 px-4 py-3 text-amber-950 dark:border-amber-400/25 dark:bg-amber-400/10 dark:text-amber-100">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="min-w-0">
            <h2 className="text-sm font-semibold">Часть показателей недоступна</h2>
            <p className="mt-1 text-xs leading-5 opacity-80">Не загрузились: {failedMetrics.join(', ')}. Остальная админка продолжает работать, точная причина записана в лог app и Sentry.</p>
          </div>
        </section>
      ) : null}
      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-slate-950 dark:text-white">Требует внимания</h2>
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">Очереди для ручной проверки</p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 min-[1360px]:grid-cols-3 2xl:grid-cols-5">
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
          {stalePendingPayments > 0 && (
            <PriorityCard href="/dashboard/admin/payments?status=PENDING" icon={<FileClock className="h-4 w-4" />} title="Оплаты" value={stalePendingPayments} text="Зависли в ожидании" />
          )}
          {supportWaiting === 0 && recoveryCount === 0 && syncFailed === 0 && duplicateCandidates.length === 0 && stalePendingPayments === 0 && (
            <div className="col-span-full flex min-h-16 items-center gap-3 rounded-[1.25rem] border border-emerald-200/80 bg-emerald-50/80 px-4 py-3 text-sm font-medium text-emerald-800 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-200">
              <ShieldCheck className="h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-300" />
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

        <div className="grid grid-cols-2 gap-2 min-[1360px]:grid-cols-4">
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

        <TrendPanel days={trendDays} />
      </section>
    </AdminPageShell>
  )
}

async function loadAdminMetric<T>(
  metric: string,
  operation: Promise<T>,
  fallback: T,
  failedMetrics: string[],
) {
  try {
    return await operation
  } catch (error) {
    failedMetrics.push(metric)
    logError('admin.dashboard.metric_failed', error, { metric })
    return fallback
  }
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
    <div className="min-w-0 border-y border-slate-200/90 py-4 dark:border-white/[0.09] sm:py-5">
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
    <span className="inline-flex items-center gap-1.5 border-l border-slate-300 pl-2.5 text-slate-500 dark:border-white/15 dark:text-slate-400">
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
    <div className="min-w-0 border-t border-slate-300 py-3.5 dark:border-white/15">
      <div className="flex items-center gap-2.5 text-sm font-medium text-slate-500 dark:text-slate-400">
          <span className="shrink-0 text-slate-400">{icon}</span>
          <span className="truncate">{title}</span>
      </div>
      <div className="mt-3 truncate text-2xl font-semibold tracking-tight tabular-nums text-slate-950 dark:text-white">{value}</div>
      <div className="mt-1 truncate text-[11px] text-slate-400">{hint}</div>
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
      className="group grid min-h-[4.5rem] grid-cols-[auto_minmax(0,1fr)] items-center gap-3 border-l-2 border-amber-400 px-3 py-2 transition-colors hover:bg-amber-50/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/60 dark:hover:bg-amber-500/[0.06]"
    >
      <div className="shrink-0 text-amber-700 dark:text-amber-200">
        {icon}
      </div>
      <div className="min-w-0">
        <div className="flex min-w-0 items-start justify-between gap-2">
          <div className="min-w-0 break-words text-sm font-semibold leading-5 text-slate-950 dark:text-white">{title}</div>
          <div className="inline-flex min-h-7 min-w-7 shrink-0 items-center justify-center border-l border-amber-300 px-2 text-sm font-semibold tabular-nums text-amber-950 dark:border-amber-400/25 dark:text-amber-100">
            {value}
          </div>
        </div>
        <div className="mt-1 line-clamp-2 text-xs leading-4 text-slate-500 dark:text-slate-400">{text}</div>
      </div>
    </Link>
  )
}
