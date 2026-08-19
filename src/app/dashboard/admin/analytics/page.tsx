import { Activity, CreditCard, RefreshCw, Repeat2, Timer, UsersRound, Wallet } from 'lucide-react'
import { AdminPageShell } from '@/components/admin/admin-page-shell'
import { requireAdminPage } from '@/lib/auth/admin-page'
import { formatPrice } from '@/lib/format'
import { conversionPercent, getProductAnalytics } from '@/lib/product-analytics'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Аналитика' }

const reasonLabels: Record<string, string> = {
  TOO_EXPENSIVE: 'Стало дорого',
  CONNECTION_ISSUES: 'Проблемы с VPN',
  NOT_USING: 'Не пользуется',
  PAYMENT_PROBLEM: 'Не подходит оплата',
  MISSING_REGION: 'Нет локации',
  OTHER: 'Другая причина',
}

const autoRenewalLabels: Record<string, string> = {
  AWAITING_PAYMENT_METHOD: 'Ждут карту',
  ACTIVE: 'Активно',
  PROCESSING: 'Списание',
  RETRYING: 'Повтор',
  PAUSED: 'Приостановлено',
  DISABLED: 'Выключено',
}

export default async function AdminAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>
}) {
  await requireAdminPage()
  const params = await searchParams
  const requestedDays = Number(params.days)
  const periodDays = [7, 30, 90, 180].includes(requestedDays) ? requestedDays : 30
  const analytics = await getProductAnalytics(periodDays)
  const registered = analytics.funnel[0]?.value ?? 0
  const paid = analytics.funnel.find((item) => item.key === 'paid')?.value ?? 0

  return (
    <AdminPageShell
      title="Аналитика"
      description="Путь клиента от регистрации до оплаты и возврата"
      action={(
        <nav className="inline-flex rounded-xl border border-slate-200 bg-white p-1 dark:border-white/10 dark:bg-white/[0.03]" aria-label="Период аналитики">
          {[7, 30, 90, 180].map((days) => (
            <a
              key={days}
              href={`/dashboard/admin/analytics?days=${days}`}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${days === periodDays ? 'bg-slate-950 text-white dark:bg-white dark:text-slate-950' : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'}`}
            >
              {days} дн.
            </a>
          ))}
        </nav>
      )}
    >
      <section className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <Metric icon={Wallet} label="Выручка" value={formatPrice(analytics.payments.revenueKopecks)} detail={`${analytics.payments.count} успешных оплат`} />
        <Metric icon={CreditCard} label="Средний чек" value={formatPrice(analytics.payments.averageKopecks)} detail={`${conversionPercent(paid, registered)}% регистрация → оплата`} />
        <Metric icon={Timer} label="До первой оплаты" value={analytics.payments.medianHoursToPayment == null ? 'Нет данных' : formatDuration(analytics.payments.medianHoursToPayment)} detail={`${analytics.payments.paidWithin24h} оплатили за первые сутки`} />
        <Metric icon={Repeat2} label="Повторные покупки" value={analytics.payments.repeatBuyers} detail="Клиенты с двумя и более оплатами за период" />
      </section>

      <section className="overflow-hidden rounded-[1.4rem] border border-slate-200 bg-white dark:border-white/[0.09] dark:bg-white/[0.025]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4 dark:border-white/[0.08] sm:px-6">
          <div>
            <h2 className="text-base font-semibold text-slate-950 dark:text-white">Воронка клиента</h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">Пользователи, зарегистрированные за выбранный период</p>
          </div>
          <span className="inline-flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400"><UsersRound className="h-4 w-4" /> {registered} входов в воронку</span>
        </div>
        <div className="grid gap-0 px-5 py-2 sm:px-6">
          {analytics.funnel.map((stage, index) => {
            const previous = analytics.funnel[index - 1]?.value ?? registered
            const width = Math.max(4, conversionPercent(stage.value, registered))
            return (
              <div key={stage.key} className="grid gap-2 border-b border-slate-100 py-3 last:border-b-0 dark:border-white/[0.06] sm:grid-cols-[11rem_minmax(0,1fr)_7rem] sm:items-center">
                <div>
                  <div className="text-sm font-semibold text-slate-900 dark:text-white">{stage.label}</div>
                  <div className="mt-0.5 text-xs text-slate-400">{index === 0 ? 'Начало пути' : `${conversionPercent(stage.value, previous)}% от прошлого шага`}</div>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-white/[0.07]">
                  <div className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-violet-500" style={{ width: `${width}%` }} />
                </div>
                <div className="flex items-baseline justify-between gap-2 sm:justify-end">
                  <strong className="text-lg tabular-nums text-slate-950 dark:text-white">{stage.value}</strong>
                  <span className="w-12 text-right text-xs tabular-nums text-slate-400">{conversionPercent(stage.value, registered)}%</span>
                </div>
              </div>
            )
          })}
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(19rem,.8fr)]">
        <div className="overflow-hidden rounded-[1.4rem] border border-slate-200 bg-white dark:border-white/[0.09] dark:bg-white/[0.025]">
          <div className="border-b border-slate-200 px-5 py-4 dark:border-white/[0.08] sm:px-6">
            <h2 className="text-base font-semibold text-slate-950 dark:text-white">Недельные когорты</h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">Показывает качество новых регистраций, а не только общий рост</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[38rem] text-left text-sm">
              <thead className="text-[11px] uppercase tracking-[0.1em] text-slate-400">
                <tr>
                  <th className="px-5 py-3 font-semibold sm:px-6">Неделя</th>
                  <th className="px-3 py-3 font-semibold">Регистрации</th>
                  <th className="px-3 py-3 font-semibold">Оплата за 7 дней</th>
                  <th className="px-3 py-3 font-semibold">Оплатили всего</th>
                  <th className="px-5 py-3 text-right font-semibold sm:px-6">Активны</th>
                </tr>
              </thead>
              <tbody>
                {analytics.cohorts.map((cohort) => (
                  <tr key={cohort.week.toISOString()} className="border-t border-slate-100 dark:border-white/[0.06]">
                    <td className="px-5 py-3 font-semibold text-slate-900 dark:text-white sm:px-6">{formatWeek(cohort.week)}</td>
                    <td className="px-3 py-3 tabular-nums text-slate-600 dark:text-slate-300">{cohort.registered}</td>
                    <td className="px-3 py-3 tabular-nums text-slate-600 dark:text-slate-300">{cohort.paidWithin7d} <small className="text-slate-400">· {conversionPercent(cohort.paidWithin7d, cohort.registered)}%</small></td>
                    <td className="px-3 py-3 tabular-nums text-slate-600 dark:text-slate-300">{cohort.paidEver} <small className="text-slate-400">· {conversionPercent(cohort.paidEver, cohort.registered)}%</small></td>
                    <td className="px-5 py-3 text-right tabular-nums text-slate-600 dark:text-slate-300 sm:px-6">{cohort.activeNow} <small className="text-slate-400">· {conversionPercent(cohort.activeNow, cohort.registered)}%</small></td>
                  </tr>
                ))}
                {analytics.cohorts.length === 0 ? <tr><td colSpan={5} className="px-6 py-10 text-center text-slate-400">Данных пока нет</td></tr> : null}
              </tbody>
            </table>
          </div>
        </div>

        <div className="space-y-4">
          <Breakdown title="Автопродление" icon={RefreshCw} items={analytics.autoRenewal.map((item) => ({ label: autoRenewalLabels[item.status] ?? item.status, value: item.count }))} empty="Автопродление ещё не настраивали" />
          <Breakdown title="Почему отключают" icon={Activity} items={analytics.retentionReasons.map((item) => ({ label: reasonLabels[item.reason] ?? item.reason, value: item.count }))} empty="Причины появятся после первых отключений" />
        </div>
      </section>

      <section className="rounded-[1.4rem] border border-slate-200 bg-white p-5 dark:border-white/[0.09] dark:bg-white/[0.025] sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-950 dark:text-white">Тарифы по выручке</h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">Только успешные оплаты за период</p>
          </div>
        </div>
        <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {analytics.planRevenue.map((plan, index) => (
            <div key={plan.planId ?? index} className="rounded-2xl border border-slate-200 p-4 dark:border-white/[0.08]">
              <div className="text-sm font-semibold text-slate-900 dark:text-white">{plan.name}</div>
              <div className="mt-3 text-xl font-semibold tabular-nums text-slate-950 dark:text-white">{formatPrice(plan.revenueKopecks)}</div>
              <div className="mt-1 text-xs text-slate-400">{plan.payments} успешных оплат</div>
            </div>
          ))}
          {analytics.planRevenue.length === 0 ? <p className="text-sm text-slate-400">Оплат за выбранный период нет</p> : null}
        </div>
      </section>
    </AdminPageShell>
  )
}

function Metric({ icon: Icon, label, value, detail }: {
  icon: typeof Wallet
  label: string
  value: string | number
  detail: string
}) {
  return (
    <article className="rounded-[1.25rem] border border-slate-200 bg-white p-4 dark:border-white/[0.09] dark:bg-white/[0.025]">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.1em] text-slate-400"><Icon className="h-4 w-4" /> {label}</div>
      <div className="mt-3 text-2xl font-semibold tracking-tight tabular-nums text-slate-950 dark:text-white">{value}</div>
      <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">{detail}</p>
    </article>
  )
}

function Breakdown({ title, icon: Icon, items, empty }: {
  title: string
  icon: typeof Activity
  items: Array<{ label: string; value: number }>
  empty: string
}) {
  const total = items.reduce((sum, item) => sum + item.value, 0)
  return (
    <section className="rounded-[1.4rem] border border-slate-200 bg-white p-5 dark:border-white/[0.09] dark:bg-white/[0.025]">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-slate-950 dark:text-white">{title}</h2>
        <Icon className="h-4 w-4 text-slate-400" />
      </div>
      <div className="mt-4 space-y-3">
        {items.map((item) => (
          <div key={item.label}>
            <div className="flex items-center justify-between gap-3 text-xs"><span className="text-slate-600 dark:text-slate-300">{item.label}</span><strong className="tabular-nums text-slate-900 dark:text-white">{item.value}</strong></div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-white/[0.07]"><div className="h-full rounded-full bg-cyan-400" style={{ width: `${Math.max(4, conversionPercent(item.value, total))}%` }} /></div>
          </div>
        ))}
        {items.length === 0 ? <p className="text-sm leading-6 text-slate-400">{empty}</p> : null}
      </div>
    </section>
  )
}

function formatWeek(value: Date) {
  return new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: 'short' }).format(value)
}

function formatDuration(hours: number) {
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} мин.`
  if (hours < 48) return `${hours.toLocaleString('ru-RU')} ч.`
  return `${Math.round(hours / 24)} дн.`
}
