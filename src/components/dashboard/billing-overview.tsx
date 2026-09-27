import Link from 'next/link'
import { ArrowRight, CalendarDays, CreditCard, MonitorSmartphone } from 'lucide-react'
import { formatPrice } from '@/lib/format'
import type { SubscriptionPresentation } from '@/lib/subscription-presentation'
import { StatusBadge } from './status-badge'

export function BillingOverview({ planName, state, unlimitedDuration, unlimitedDevices, deviceLimit, renewalPrice, durationDays, includesAddon }: {
  planName: string
  state: SubscriptionPresentation
  unlimitedDuration: boolean
  unlimitedDevices: boolean
  deviceLimit: number | null
  renewalPrice: number | null
  durationDays: number | null
  includesAddon: boolean
}) {
  const paused = state.phase === 'paused'
  return (
    <section data-testid="billing-overview" aria-labelledby="billing-plan-title" className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-white/10 dark:bg-white/[0.025]">
      <div className="border-b border-slate-200 px-5 py-5 dark:border-white/10 sm:px-6">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">Ваша подписка</p>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h2 id="billing-plan-title" className="text-2xl font-semibold tracking-tight">{planName}</h2>
          <StatusBadge status={state.status} />
        </div>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500 dark:text-slate-400">{state.description}</p>
      </div>
      <dl className="grid divide-y divide-slate-200 dark:divide-white/10 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        <div className="px-5 py-4 sm:px-6">
          <dt className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400"><CalendarDays className="h-4 w-4" />{paused ? 'Остаток доступа' : state.phase === 'grace' ? 'Льготный период до' : state.phase === 'expired' ? 'Доступ закончился' : 'Доступ оплачен до'}</dt>
          <dd className="mt-2 text-base font-semibold">{paused ? 'Сохранён на паузе' : unlimitedDuration ? 'Без ограничения срока' : state.expireAt?.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Moscow' }) ?? 'Уточняется'}</dd>
        </div>
        <div className="px-5 py-4 sm:px-6">
          <dt className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400"><MonitorSmartphone className="h-4 w-4" />Устройства</dt>
          <dd className="mt-2 text-base font-semibold">{unlimitedDevices ? 'Без ограничений' : deviceLimit == null ? 'По условиям тарифа' : `До ${deviceLimit} одновременно`}</dd>
          <Link href="/dashboard/devices" className="mt-1 inline-block text-xs text-brand-700 underline dark:text-brand-300">Управлять устройствами</Link>
        </div>
        <div className="px-5 py-4 sm:px-6">
          <dt className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400"><CreditCard className="h-4 w-4" />Продление по текущим условиям</dt>
          <dd className="mt-2 text-base font-semibold">{unlimitedDuration ? 'Не требуется' : renewalPrice == null ? 'Уточняется при выборе тарифа' : `${formatPrice(renewalPrice)} за ${durationDays} дн.`}</dd>
          {!unlimitedDuration && renewalPrice != null ? <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">{includesAddon ? 'С устройствами и дополнением «Белые списки»' : 'С учётом устройств и постоянной скидки'}</p> : null}
        </div>
      </dl>
      <div className="flex flex-col gap-2 border-t border-slate-200 bg-slate-50/60 px-5 py-4 dark:border-white/10 dark:bg-white/[0.02] sm:flex-row sm:items-center sm:px-6">
        <Link href={paused ? '#auto-renewal' : unlimitedDuration ? '/dashboard/plans' : '/dashboard/plans?intent=renew'} className="btn-primary w-full sm:w-auto">
          {paused ? 'Возобновить доступ' : unlimitedDuration ? 'Сменить тариф' : 'Продлить подписку'}<ArrowRight className="h-4 w-4" />
        </Link>
        {state.usable ? <Link href="/dashboard/subscription" className="btn-secondary w-full sm:w-auto">Подключить VPN</Link> : null}
        {!unlimitedDuration && !paused ? <Link href="/dashboard/plans" className="inline-flex min-h-11 items-center justify-center px-3 text-sm font-medium text-slate-500 hover:underline dark:text-slate-400 sm:ml-auto">Другие тарифы</Link> : null}
      </div>
    </section>
  )
}
