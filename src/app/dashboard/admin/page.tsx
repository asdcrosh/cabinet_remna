import Link from 'next/link'
import {
  ArrowUpRight,
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
        <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/80 px-3 py-1.5 text-xs text-slate-500 shadow-sm dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-300">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-40 motion-safe:animate-ping" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </span>
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
      <section className="relative overflow-hidden rounded-[1.5rem] border border-amber-200/80 bg-gradient-to-br from-amber-50 via-white to-orange-50/60 p-4 shadow-[0_12px_35px_-24px_rgba(217,119,6,0.45)] dark:border-amber-400/15 dark:from-amber-500/[0.09] dark:via-white/[0.025] dark:to-orange-500/[0.05] sm:p-5">
        <div className="pointer-events-none absolute -right-16 -top-20 h-44 w-44 rounded-full bg-amber-300/20 blur-3xl dark:bg-amber-400/10" />
        <div className="relative flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-400/15 text-amber-700 ring-1 ring-amber-500/20 dark:text-amber-200">
                <TriangleAlert className="h-4 w-4" />
              </span>
              <h2 className="text-lg font-semibold tracking-tight text-slate-950 dark:text-white">Требует внимания</h2>
            </div>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Очереди для ручной проверки</p>
          </div>
          <span className="rounded-full border border-amber-300/70 bg-amber-100/80 px-2.5 py-1 text-xs font-medium text-amber-800 dark:border-amber-300/15 dark:bg-amber-300/10 dark:text-amber-200">
            {supportWaiting + recoveryCount + syncFailed + duplicateCandidates.length + stalePendingPayments} к проверке
          </span>
        </div>
        <div className="relative mt-4 grid gap-2.5 sm:grid-cols-2 min-[1360px]:grid-cols-3 2xl:grid-cols-5">
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
            <div className="col-span-full flex min-h-20 items-center gap-3 rounded-[1.15rem] border border-emerald-200/80 bg-emerald-50/80 px-4 py-3 text-sm font-medium text-emerald-800 shadow-sm dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-200">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 ring-1 ring-emerald-500/15">
                <ShieldCheck className="h-5 w-5 text-emerald-600 dark:text-emerald-300" />
              </span>
              <div>
                <div className="font-semibold">Очереди чистые</div>
                <div className="mt-0.5 text-xs font-normal text-emerald-700/80 dark:text-emerald-300/80">Срочных действий нет</div>
              </div>
            </div>
          )}
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-slate-950 dark:text-white">Рабочая сводка</h2>
            <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">Регистрации, платежи и источники пользователей</p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 min-[1360px]:grid-cols-4">
          <AnalyticsCard
            icon={<UserPlus className="h-5 w-5" />}
            accent="violet"
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
            accent="cyan"
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
            accent="emerald"
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
            accent="fuchsia"
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
    <div className="relative min-w-0 overflow-hidden rounded-[1.5rem] border border-slate-200/80 bg-white p-4 shadow-[0_18px_50px_-32px_rgba(15,23,42,0.35)] dark:border-white/[0.09] dark:bg-white/[0.035] sm:p-5">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-fuchsia-500/[0.05] to-transparent dark:from-fuchsia-400/[0.07]" />
      <div className="relative flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-base font-semibold tracking-tight text-slate-950 dark:text-white">Динамика за 14 дней</div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">Ежедневная выручка и новые аккаунты</div>
        </div>
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-fuchsia-500/10 text-fuchsia-600 ring-1 ring-fuchsia-500/15 dark:text-fuchsia-300">
          <BarChart3 className="h-4 w-4" aria-hidden="true" />
        </span>
      </div>
      <div className="relative mt-4 grid grid-cols-1 gap-2 text-xs sm:grid-cols-3">
        <TrendTotal label="Регистрации" value={totals.users} />
        <TrendTotal label="Оплаты" value={totals.payments} />
        <TrendTotal label="Выручка" value={formatPrice(totals.amount)} />
      </div>
      <div className="relative mt-5 overflow-x-auto pb-1">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-[linear-gradient(to_bottom,rgba(148,163,184,0.13)_1px,transparent_1px)] bg-[length:100%_25%]" />
        <div className="relative grid min-w-[36rem] items-end gap-2" style={{ gridTemplateColumns: 'repeat(14, minmax(2rem, 1fr))' }}>
          {days.map((day) => {
            const amountHeight = Math.max(8, Math.round((day.amountKopecks / maxAmount) * 104))
            const userHeight = Math.max(6, Math.round((day.users / maxUsers) * 62))
            return (
              <div key={day.label} className="group flex min-w-8 flex-col items-center gap-2">
                <div className="flex h-28 items-end gap-1">
                  <div
                    className="w-2.5 rounded-t-full bg-gradient-to-t from-fuchsia-600 to-fuchsia-400 shadow-[0_0_16px_-5px_rgba(217,70,239,0.9)] transition-[filter] group-hover:brightness-125"
                    style={{ height: day.amountKopecks > 0 ? amountHeight : 4 }}
                    title={`${day.label}: ${formatPrice(day.amountKopecks)}`}
                  />
                  <div
                    className="w-2.5 rounded-t-full bg-gradient-to-t from-emerald-600 to-emerald-300 shadow-[0_0_16px_-5px_rgba(52,211,153,0.8)] transition-[filter] group-hover:brightness-125"
                    style={{ height: day.users > 0 ? userHeight : 4 }}
                    title={`${day.label}: ${day.users} регистраций`}
                  />
                </div>
                <div className="text-[10px] tabular-nums text-slate-400 transition-colors group-hover:text-slate-700 dark:group-hover:text-slate-200">{day.label}</div>
              </div>
            )
          })}
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-4 border-t border-slate-100 pt-4 text-xs text-slate-500 dark:border-white/[0.07] dark:text-slate-400">
        <LegendDot className="bg-fuchsia-400" label="выручка" />
        <LegendDot className="bg-emerald-400" label="регистрации" />
      </div>
    </div>
  )
}

function TrendTotal({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <span className="flex min-w-0 items-center justify-between gap-2 rounded-xl border border-slate-200/70 bg-slate-50/80 px-3 py-2 text-slate-500 dark:border-white/[0.07] dark:bg-black/10 dark:text-slate-400">
      <span className="truncate">{label}</span>
      <strong className="truncate font-semibold tabular-nums text-slate-800 dark:text-slate-100">{value}</strong>
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
  accent,
  title,
  value,
  hint,
  details,
}: {
  icon: React.ReactNode
  accent: 'violet' | 'cyan' | 'emerald' | 'fuchsia'
  title: string
  value: React.ReactNode
  hint: string
  details: Array<{ label: string; value: React.ReactNode }>
}) {
  const accentClasses = {
    violet: 'bg-violet-500/10 text-violet-600 ring-violet-500/15 dark:text-violet-300',
    cyan: 'bg-cyan-500/10 text-cyan-600 ring-cyan-500/15 dark:text-cyan-300',
    emerald: 'bg-emerald-500/10 text-emerald-600 ring-emerald-500/15 dark:text-emerald-300',
    fuchsia: 'bg-fuchsia-500/10 text-fuchsia-600 ring-fuchsia-500/15 dark:text-fuchsia-300',
  }

  return (
    <div className="group relative min-w-0 overflow-hidden rounded-[1.35rem] border border-slate-200/80 bg-white p-4 shadow-[0_16px_42px_-30px_rgba(15,23,42,0.45)] transition-transform duration-200 hover:-translate-y-0.5 dark:border-white/[0.09] dark:bg-white/[0.035]">
      <div className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-current opacity-[0.035] blur-2xl" />
      <div className="relative flex items-center gap-2.5 text-sm font-medium text-slate-500 dark:text-slate-400">
          <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ring-1', accentClasses[accent])}>{icon}</span>
          <span className="truncate font-medium">{title}</span>
      </div>
      <div className="relative mt-4 truncate text-3xl font-semibold tracking-[-0.035em] tabular-nums text-slate-950 dark:text-white">{value}</div>
      <div className="relative mt-1 truncate text-[11px] font-medium uppercase tracking-[0.12em] text-slate-400">{hint}</div>
      <div className="relative mt-4 grid grid-cols-2 gap-2 rounded-xl bg-slate-50/90 p-3 text-xs text-slate-500 dark:bg-black/15 dark:text-slate-400">
        {details.map((detail) => (
          <span key={detail.label} className="min-w-0">
            <span className="block truncate">{detail.label}</span>
            <strong className="mt-1 block truncate font-semibold tabular-nums text-slate-800 dark:text-slate-100">{detail.value}</strong>
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
      className="group grid min-h-[5.25rem] grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-[1.15rem] border border-amber-200/80 bg-white/75 p-3 shadow-sm transition-all hover:-translate-y-0.5 hover:border-amber-300 hover:bg-white hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/60 dark:border-amber-300/10 dark:bg-white/[0.035] dark:hover:border-amber-300/20 dark:hover:bg-white/[0.06]"
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-400/15 text-amber-700 ring-1 ring-amber-500/15 dark:text-amber-200">
        {icon}
      </div>
      <div className="min-w-0">
        <div className="min-w-0 break-words text-sm font-semibold leading-5 text-slate-950 dark:text-white">{title}</div>
        <div className="mt-1 line-clamp-2 text-xs leading-4 text-slate-500 dark:text-slate-400">{text}</div>
      </div>
      <div className="flex flex-col items-end gap-2">
        <div className="inline-flex min-h-7 min-w-7 shrink-0 items-center justify-center rounded-lg bg-amber-400/15 px-2 text-sm font-semibold tabular-nums text-amber-900 dark:text-amber-100">
          {value}
        </div>
        <ArrowUpRight className="h-3.5 w-3.5 text-amber-700/50 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 dark:text-amber-200/50" />
      </div>
    </Link>
  )
}
