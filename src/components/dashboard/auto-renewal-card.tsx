'use client'

import { useState } from 'react'
import { CalendarClock, CreditCard, Loader2, RefreshCw } from 'lucide-react'
import { apiFetch } from '@/lib/api-client'
import { toast } from '@/components/ui/toaster'
import { Switch } from '@/components/ui/switch'

type AutoRenewalState = {
  id: string
  plan: { id: string; name: string; priceKopecks: number; durationDays: number }
  status: 'AWAITING_PAYMENT_METHOD' | 'ACTIVE' | 'PROCESSING' | 'RETRYING' | 'PAUSED' | 'DISABLED'
  paymentMethodTitle: string | null
  paymentMethodSavedAt: string | null
  nextChargeAt: string | null
  retryCount: number
  lastAttemptAt: string | null
  lastSuccessAt: string | null
  lastError: string | null
} | null

export function AutoRenewalCard({
  planId,
  planName,
  initialState,
}: {
  planId: string
  planName: string
  initialState: AutoRenewalState
}) {
  const [state, setState] = useState(initialState)
  const [saving, setSaving] = useState(false)
  const enabled = Boolean(state && state.status !== 'DISABLED')

  async function changeEnabled(next: boolean) {
    setSaving(true)
    try {
      const data = await apiFetch<{ autoRenewal: AutoRenewalState }>('/api/auto-renewal', {
        method: next ? 'POST' : 'DELETE',
        body: next ? JSON.stringify({ planId }) : undefined,
      })
      setState(data.autoRenewal)
      toast(next ? 'Автопродление включено' : 'Автопродление выключено', 'success')
    } finally {
      setSaving(false)
    }
  }

  const pendingMethod = state?.status === 'AWAITING_PAYMENT_METHOD'
  const paused = state?.status === 'PAUSED'
  const retrying = state?.status === 'RETRYING'

  return (
    <section className="overflow-hidden rounded-[1.4rem] border border-slate-200 bg-white dark:border-white/[0.09] dark:bg-white/[0.035]" aria-labelledby="auto-renewal-title">
      <div className="flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-start sm:justify-between sm:px-6">
        <div className="flex min-w-0 items-start gap-3.5">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-cyan-500/10 text-cyan-600 dark:bg-cyan-300/10 dark:text-cyan-300">
            <RefreshCw className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h2 id="auto-renewal-title" className="text-base font-semibold text-slate-950 dark:text-white">Автопродление</h2>
            <p className="mt-1 max-w-xl text-sm leading-6 text-slate-500 dark:text-slate-400">
              Продлим «{state?.plan.name ?? planName}» до окончания доступа. Отключить можно в любой момент.
            </p>
          </div>
        </div>
        <div className="flex min-h-9 items-center gap-3 self-stretch rounded-2xl bg-slate-50 px-3 py-2 dark:bg-white/[0.045] sm:self-auto">
          <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{enabled ? 'Включено' : 'Выключено'}</span>
          {saving ? <Loader2 className="h-5 w-5 animate-spin text-slate-400" /> : (
            <Switch
              checked={enabled}
              onCheckedChange={(checked) => void changeEnabled(checked)}
              label={enabled ? 'Выключить автопродление' : 'Включить автопродление'}
              compact
            />
          )}
        </div>
      </div>

      {enabled ? (
        <div className="grid border-t border-slate-200 dark:border-white/[0.08] sm:grid-cols-2">
          <StatusCell
            icon={CreditCard}
            label="Способ оплаты"
            value={pendingMethod ? 'Сохранится при следующей оплате' : state?.paymentMethodTitle ?? 'Сохранён в ЮKassa'}
            detail={pendingMethod ? 'Оплатите тариф картой через ЮKassa один раз' : 'Данные карты не хранятся в кабинете'}
          />
          <StatusCell
            icon={CalendarClock}
            label={paused ? 'Списание остановлено' : retrying ? 'Повторное списание' : 'Следующее списание'}
            value={paused ? 'Нужна ручная оплата' : state?.nextChargeAt ? formatDate(state.nextChargeAt) : 'После следующей оплаты'}
            detail={retrying ? `Попытка ${state.retryCount + 1} из 3` : state?.lastError && paused ? state.lastError : 'До окончания текущего доступа'}
          />
        </div>
      ) : null}
    </section>
  )
}

function StatusCell({ icon: Icon, label, value, detail }: {
  icon: typeof CreditCard
  label: string
  value: string
  detail: string
}) {
  return (
    <div className="flex gap-3 px-5 py-4 first:border-b first:border-slate-200 dark:first:border-white/[0.08] sm:px-6 sm:first:border-b-0 sm:first:border-r sm:first:border-slate-200 sm:dark:first:border-white/[0.08]">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
      <div className="min-w-0">
        <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">{label}</div>
        <div className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">{value}</div>
        <div className="mt-0.5 text-xs leading-5 text-slate-500">{detail}</div>
      </div>
    </div>
  )
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Moscow',
  }).format(new Date(value))
}
