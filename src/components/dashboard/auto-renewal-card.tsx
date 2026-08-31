'use client'

import { useState } from 'react'
import Link from 'next/link'
import { CalendarClock, CreditCard, Loader2, PauseCircle, Play, RefreshCw } from 'lucide-react'
import { apiFetch } from '@/lib/api-client'
import { toast } from '@/components/ui/toaster'
import { Modal } from '@/components/ui/modal'
import { Checkbox } from '@/components/ui/checkbox'
import { formatPrice } from '@/lib/format'
import { AUTO_RENEWAL_CONSENT_VERSION } from '@/lib/auto-renewal-consent'

type AutoRenewalState = {
  id: string
  plan: { id: string; name: string; priceKopecks: number; durationDays: number }
  status: 'AWAITING_PAYMENT_METHOD' | 'ACTIVE' | 'PROCESSING' | 'RETRYING' | 'PAUSED' | 'DISABLED'
  paymentMethodTitle: string | null
  paymentMethodSavedAt: string | null
  consentAcceptedAt: string | null
  consentVersion: string | null
  consentPriceKopecks: number | null
  consentDurationDays: number | null
  deviceLimit: number
  nextChargeAt: string | null
  retryCount: number
  lastAttemptAt: string | null
  lastSuccessAt: string | null
  lastError: string | null
} | null

type PauseState = {
  id: string
  reason: RetentionReason
  comment: string | null
  pauseUntil: string | null
  createdAt: string
  subscription: { id: string; plan: { name: string } | null } | null
} | null

type RetentionReason = 'TOO_EXPENSIVE' | 'CONNECTION_ISSUES' | 'NOT_USING' | 'PAYMENT_PROBLEM' | 'MISSING_REGION' | 'OTHER'

const reasons: Array<{ value: RetentionReason; title: string; detail: string }> = [
  { value: 'TOO_EXPENSIVE', title: 'Стало дорого', detail: 'Учтём это при подготовке тарифов' },
  { value: 'NOT_USING', title: 'Пока не пользуюсь', detail: 'Можно сохранить остаток на паузе' },
  { value: 'CONNECTION_ISSUES', title: 'Есть проблемы с VPN', detail: 'Поможем проверить подключение' },
  { value: 'PAYMENT_PROBLEM', title: 'Не подходит оплата', detail: 'Можно продолжить вручную другим способом' },
  { value: 'MISSING_REGION', title: 'Нет нужной локации', detail: 'Передадим запрос команде' },
  { value: 'OTHER', title: 'Другая причина', detail: 'Можно коротко описать ниже' },
]

export function AutoRenewalCard({
  planId,
  planName,
  planPriceKopecks,
  planDurationDays,
  planDeviceLimit,
  accessExpiresAt = null,
  initialState,
  initialPause,
}: {
  planId: string
  planName: string
  planPriceKopecks: number
  planDurationDays: number
  planDeviceLimit: number
  accessExpiresAt?: string | null
  initialState: AutoRenewalState
  initialPause: PauseState
}) {
  const [state, setState] = useState(initialState)
  const [pause, setPause] = useState(initialPause)
  const [saving, setSaving] = useState(false)
  const [dialog, setDialog] = useState<'enable' | 'disable' | 'pause' | null>(null)
  const [consentAccepted, setConsentAccepted] = useState(false)
  const [reason, setReason] = useState<RetentionReason>('NOT_USING')
  const [pauseDays, setPauseDays] = useState(14)
  const [comment, setComment] = useState('')
  const consentCurrent = Boolean(
    state?.consentAcceptedAt
    && state.consentVersion === AUTO_RENEWAL_CONSENT_VERSION
    && state.deviceLimit === planDeviceLimit
    && state.consentPriceKopecks != null
    && state.consentPriceKopecks >= planPriceKopecks
    && state.consentDurationDays === planDurationDays
  )
  const enabled = Boolean(state && state.status !== 'DISABLED' && consentCurrent)
  const cancellable = Boolean(state && state.status !== 'DISABLED')

  async function changeEnabled(next: boolean) {
    if (!next) {
      setDialog('disable')
      return
    }
    setConsentAccepted(false)
    setDialog('enable')
  }

  async function submitEnable() {
    if (!consentAccepted) return
    setSaving(true)
    try {
      const data = await apiFetch<{ autoRenewal: AutoRenewalState }>('/api/auto-renewal', {
        method: 'POST',
        body: JSON.stringify({
          planId,
          consentAccepted: true,
          consentVersion: AUTO_RENEWAL_CONSENT_VERSION,
        }),
      })
      setState(data.autoRenewal)
      setDialog(null)
      setConsentAccepted(false)
      toast('Согласие принято. Автопродление включено', 'success')
    } finally {
      setSaving(false)
    }
  }

  async function submitRetention() {
    if (dialog !== 'pause') return
    setSaving(true)
    try {
      const data = await apiFetch<{ pause: PauseState }>('/api/retention', {
        method: 'POST',
        body: JSON.stringify({ action: 'PAUSE', reason, pauseDays, comment }),
      })
      setPause(data.pause)
      toast('Остаток подписки сохранён на паузе', 'success')
      setDialog(null)
      setComment('')
    } finally {
      setSaving(false)
    }
  }

  async function submitDisable() {
    setSaving(true)
    try {
      const data = await apiFetch<{ autoRenewal: AutoRenewalState }>('/api/auto-renewal', {
        method: 'DELETE',
      })
      setState(data.autoRenewal)
      setDialog(null)
      toast('Карта отвязана. Автопродление отключено, оплаченный срок сохранён', 'success')
    } finally {
      setSaving(false)
    }
  }

  async function resumeAccess() {
    setSaving(true)
    try {
      await apiFetch('/api/retention', { method: 'DELETE' })
      setPause(null)
      toast('Доступ снова активен', 'success')
    } finally {
      setSaving(false)
    }
  }

  const pendingMethod = state?.status === 'AWAITING_PAYMENT_METHOD'
  const paused = state?.status === 'PAUSED'
  const retrying = state?.status === 'RETRYING'

  return (
    <>
    <section id="auto-renewal" className="scroll-mt-24 overflow-hidden rounded-[1.4rem] border border-slate-200 bg-white dark:border-white/[0.09] dark:bg-white/[0.035]" aria-labelledby="auto-renewal-title">
      <div className="flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-start sm:justify-between sm:px-6">
        <div className="flex min-w-0 items-start gap-3.5">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-cyan-500/10 text-cyan-600 dark:bg-cyan-300/10 dark:text-cyan-300">
            <RefreshCw className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h2 id="auto-renewal-title" className="text-base font-semibold text-slate-950 dark:text-white">Автопродление</h2>
            <p className="mt-1 max-w-xl text-sm leading-6 text-slate-500 dark:text-slate-400">
              {pause ? `Остаток «${pause.subscription?.plan?.name ?? planName}» сохранён до возобновления.` : `Продлим «${state?.plan.name ?? planName}» до окончания доступа. Отключить можно в любой момент.`}
            </p>
          </div>
        </div>
        <div className="flex min-h-9 items-center gap-3 self-stretch rounded-2xl bg-slate-50 px-3 py-2 dark:bg-white/[0.045] sm:self-auto">
          <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
            {enabled ? 'Включено' : state && state.status !== 'DISABLED' ? 'Нужно согласие' : 'Выключено'}
          </span>
          {pause ? (
            <button className="inline-flex items-center gap-2 text-sm font-semibold text-cyan-700 dark:text-cyan-300" disabled={saving} onClick={() => void resumeAccess()}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              Возобновить
            </button>
          ) : saving ? <Loader2 className="h-5 w-5 animate-spin text-slate-400" /> : cancellable ? (
            <button
              type="button"
              className="inline-flex min-h-8 items-center rounded-lg px-2.5 text-sm font-semibold text-red-600 transition hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-500/10"
              onClick={() => void changeEnabled(false)}
            >
              Отключить и отвязать карту
            </button>
          ) : (
            <button
              type="button"
              className="inline-flex min-h-8 items-center rounded-lg bg-cyan-500 px-3 text-sm font-semibold text-white transition hover:bg-cyan-600 dark:bg-cyan-300 dark:text-slate-950 dark:hover:bg-cyan-200"
              onClick={() => void changeEnabled(true)}
            >
              Подключить автопродление
            </button>
          )}
        </div>
      </div>

      {pause ? (
        <div className="flex flex-col gap-3 border-t border-slate-200 bg-amber-50/70 px-5 py-4 dark:border-white/[0.08] dark:bg-amber-300/[0.05] sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div>
            <div className="text-sm font-semibold text-slate-900 dark:text-white">Доступ на паузе</div>
            <div className="mt-0.5 text-xs leading-5 text-slate-500 dark:text-slate-400">
              Автоматически включится {pause.pauseUntil ? formatDate(pause.pauseUntil) : 'после ручного возобновления'}.
            </div>
          </div>
          <span className="inline-flex items-center gap-2 text-xs font-semibold text-amber-700 dark:text-amber-300"><PauseCircle className="h-4 w-4" /> Дни не расходуются</span>
        </div>
      ) : enabled ? (
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
      {!pause ? (
        <div className="flex flex-col gap-2 border-t border-slate-200 px-5 py-3 dark:border-white/[0.08] sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <span className="text-xs leading-5 text-slate-500 dark:text-slate-400">
            {enabled && state?.consentAcceptedAt
              ? <>Согласие на регулярные списания принято {formatDate(state.consentAcceptedAt)}. <Link href="/offer" className="font-semibold text-brand-600 hover:underline dark:text-brand-300">Условия</Link></>
              : 'Не нужен VPN какое-то время? Срок можно заморозить до 30 дней.'}
          </span>
          <button className="inline-flex min-h-9 shrink-0 items-center justify-center gap-2 rounded-xl px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-white/[0.06]" onClick={() => setDialog('pause')}>
            <PauseCircle className="h-4 w-4" /> Поставить на паузу
          </button>
        </div>
      ) : null}
    </section>

    <Modal
      open={dialog !== null}
      title={dialog === 'enable' ? 'Согласие на автопродление' : dialog === 'pause' ? 'Приостановить доступ' : 'Отвязать карту'}
      description={dialog === 'enable'
        ? 'Регулярные списания включатся только после вашего явного подтверждения.'
        : dialog === 'pause'
          ? 'Остаток дней сохранится. Устройства и профиль останутся на месте.'
          : 'Удалим идентификатор сохранённой карты из кабинета и отключим следующие автоматические списания.'}
      onClose={() => {
        if (saving) return
        setDialog(null)
        setConsentAccepted(false)
      }}
      panelClassName="sm:max-w-2xl"
      footer={dialog === 'enable' ? (
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button className="btn-secondary" disabled={saving} onClick={() => setDialog(null)}>Отмена</button>
          <button className="btn-primary" disabled={saving || !consentAccepted} onClick={() => void submitEnable()}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Согласен и включить
          </button>
        </div>
      ) : dialog === 'disable' ? (
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button className="btn-secondary" disabled={saving} onClick={() => setDialog(null)}>Оставить включённым</button>
          <button className="inline-flex min-h-11 items-center justify-center rounded-xl bg-red-600 px-4 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-60" disabled={saving} onClick={() => void submitDisable()}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Отвязать карту
          </button>
        </div>
      ) : (
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button className="btn-secondary" disabled={saving} onClick={() => setDialog(null)}>Отмена</button>
          <button className="btn-primary" disabled={saving} onClick={() => void submitRetention()}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Сохранить остаток
          </button>
        </div>
      )}
    >
      {dialog === 'enable' ? (
        <div className="space-y-4">
          <div className="grid overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 dark:border-white/10 dark:bg-white/[0.035] sm:grid-cols-2">
            <div className="p-4 sm:p-5">
              <div className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Регулярный платёж</div>
              <div className="mt-2 text-2xl font-semibold tracking-tight text-slate-950 dark:text-white">{formatPrice(planPriceKopecks)}</div>
              <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                {planDeviceLimit} устройств · каждые {planDurationDays} дней
              </div>
            </div>
            <div className="border-t border-slate-200 p-4 dark:border-white/10 sm:border-l sm:border-t-0 sm:p-5">
              <div className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Когда спишется</div>
              <div className="mt-2 text-sm font-semibold text-slate-900 dark:text-white">За 24 часа до окончания</div>
              <div className="mt-1 text-sm leading-5 text-slate-500 dark:text-slate-400">Точную дату покажем в разделе платежей.</div>
            </div>
          </div>

          <Checkbox
            checked={consentAccepted}
            onChange={(event) => setConsentAccepted(event.target.checked)}
            label={(
              <span>
                Я согласен на регулярное списание {formatPrice(planPriceKopecks)} каждые {planDurationDays} дней для продления тарифа «{planName}» и принимаю{' '}
                <Link href="/offer" target="_blank" className="font-semibold text-brand-600 hover:underline dark:text-brand-300" onClick={(event) => event.stopPropagation()}>условия оферты</Link>.
              </span>
            )}
            description="Согласие можно отозвать в любой момент до следующего списания. Полные данные карты хранит ЮKassa, а не кабинет."
            className="w-full rounded-2xl border border-slate-200 p-4 dark:border-white/10"
          />
        </div>
      ) : dialog === 'disable' ? (
        <div className="space-y-3">
          <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/[0.035]">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-500/10 text-brand-600 dark:text-brand-300">
              <CreditCard className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <div className="text-xs font-medium text-slate-500 dark:text-slate-400">Способ оплаты</div>
              <div className="mt-0.5 truncate text-sm font-semibold text-slate-950 dark:text-white">
                {state?.paymentMethodTitle ?? 'Сохранённый способ оплаты ЮKassa'}
              </div>
            </div>
          </div>
          <div className="rounded-2xl border border-red-200 bg-red-50/70 p-4 text-sm leading-6 text-red-900 dark:border-red-500/25 dark:bg-red-500/[0.07] dark:text-red-100">
            Карта будет отвязана от аккаунта, а автопродление отключено. Новых списаний не будет. Доступ сохранится {accessExpiresAt ? `до ${formatDateOnly(accessExpiresAt)}` : 'до окончания оплаченного срока'}.
          </div>
        </div>
      ) : <>
      <div className="grid gap-2 sm:grid-cols-2">
        {reasons.map((item) => (
          <button
            key={item.value}
            type="button"
            aria-pressed={reason === item.value}
            onClick={() => setReason(item.value)}
            className={`rounded-2xl border p-3.5 text-left transition ${reason === item.value ? 'border-cyan-500 bg-cyan-50 ring-2 ring-cyan-500/10 dark:border-cyan-300 dark:bg-cyan-300/[0.07]' : 'border-slate-200 hover:border-slate-300 dark:border-white/10 dark:hover:border-white/20'}`}
          >
            <span className="block text-sm font-semibold text-slate-900 dark:text-white">{item.title}</span>
            <span className="mt-1 block text-xs leading-5 text-slate-500 dark:text-slate-400">{item.detail}</span>
          </button>
        ))}
      </div>
      {dialog === 'pause' ? (
        <label className="mt-4 block">
          <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">Срок паузы</span>
          <select className="input mt-2" value={pauseDays} onChange={(event) => setPauseDays(Number(event.target.value))}>
            <option value={7}>7 дней</option>
            <option value={14}>14 дней</option>
            <option value={30}>30 дней</option>
          </select>
        </label>
      ) : null}
      <label className="mt-4 block">
        <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">Комментарий <span className="font-normal text-slate-400">необязательно</span></span>
        <textarea className="input mt-2 min-h-24 resize-y" maxLength={500} value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Что именно можно улучшить?" />
      </label>
      {reason === 'CONNECTION_ISSUES' ? (
        <Link href="/dashboard/support" className="mt-4 inline-flex text-sm font-semibold text-cyan-700 hover:underline dark:text-cyan-300">Сначала попросить помощь с подключением</Link>
      ) : null}
      </>}
    </Modal>
    </>
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

function formatDateOnly(value: string) {
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'Europe/Moscow',
  }).format(new Date(value))
}
