'use client'

import { type ReactNode, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowRight, CalendarClock, CreditCard, Loader2, PauseCircle, Play, ReceiptText, RefreshCw, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/cn'
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
  canPause = true,
  canEnable = true,
  initialState,
  initialPause,
}: {
  planId: string
  planName: string
  planPriceKopecks: number | null
  planDurationDays: number
  planDeviceLimit: number
  accessExpiresAt?: string | null
  canPause?: boolean
  canEnable?: boolean
  initialState: AutoRenewalState
  initialPause: PauseState
}) {
  const router = useRouter()
  const [state, setState] = useState(initialState)
  const [pause, setPause] = useState(initialPause)
  const [saving, setSaving] = useState(false)
  const [dialog, setDialog] = useState<'enable' | 'disable' | 'pause' | null>(null)
  const [consentAccepted, setConsentAccepted] = useState(false)
  const [reason, setReason] = useState<RetentionReason>('NOT_USING')
  const [pauseDays, setPauseDays] = useState(14)
  const [comment, setComment] = useState('')
  useEffect(() => {
    setState(initialState)
    setPause(initialPause)
  }, [initialState, initialPause])
  const priceLabel = planPriceKopecks == null ? 'Сумма уточняется' : formatPrice(planPriceKopecks)
  const consentCurrent = Boolean(
    state?.consentAcceptedAt
    && state.consentVersion === AUTO_RENEWAL_CONSENT_VERSION
    && state.deviceLimit === planDeviceLimit
    && state.plan.id === planId
    && planPriceKopecks != null
    && state.consentPriceKopecks != null
    && state.consentPriceKopecks >= planPriceKopecks
    && state.consentDurationDays === planDurationDays
  )
  const enabled = Boolean(
    state
    && ['ACTIVE', 'PROCESSING', 'RETRYING'].includes(state.status)
    && consentCurrent
  )
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
    if (!consentAccepted || !canEnable || planPriceKopecks == null) return
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
      toast(
        data.autoRenewal?.status === 'AWAITING_PAYMENT_METHOD'
          ? 'Настройка сохранена. Теперь привяжите карту при оплате'
          : 'Автопродление включено',
        'success'
      )
      router.refresh()
    } catch {
      // apiFetch reports the error and the dialog stays open for retry.
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
      router.refresh()
    } catch {
      // Keep the existing state until the server confirms the change.
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
      router.refresh()
    } catch {
      // apiFetch reports the error; do not show a successful unlink.
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
      router.refresh()
    } catch {
      // The pause stays visible when resuming fails.
    } finally {
      setSaving(false)
    }
  }

  const pendingMethod = state?.status === 'AWAITING_PAYMENT_METHOD'
  const retrying = state?.status === 'RETRYING'
  const processing = state?.status === 'PROCESSING'
  const renewalPaused = state?.status === 'PAUSED'
  const configured = Boolean(state && state.status !== 'DISABLED')
  const needsConsent = Boolean(configured && !consentCurrent)
  const status = pause
    ? { label: 'На паузе', tone: 'amber' as const, description: `Остаток «${pause.subscription?.plan?.name ?? planName}» сохранён и не расходуется.` }
    : pendingMethod
      ? { label: 'Нужна карта', tone: 'cyan' as const, description: 'Остался один шаг: оплатите тариф картой через ЮKassa, и она сохранится для следующих продлений.' }
      : processing
        ? { label: 'Идёт списание', tone: 'cyan' as const, description: 'ЮKassa обрабатывает платёж. Обычно это занимает несколько секунд.' }
        : retrying
          ? { label: 'Платёж не прошёл', tone: 'amber' as const, description: 'Повторим списание автоматически. Срок доступа указан в вашей подписке выше.' }
          : renewalPaused
            ? { label: 'Требуется действие', tone: 'amber' as const, description: state?.lastError ?? 'Автопродление остановлено. Оплатите подписку вручную или привяжите другую карту.' }
          : needsConsent
            ? { label: 'Нужно подтверждение', tone: 'amber' as const, description: 'Условия тарифа изменились. Подтвердите новую сумму, чтобы продление продолжило работать.' }
            : enabled
              ? { label: 'Работает', tone: 'emerald' as const, description: 'Подписка продлевается с сохранённой карты. Сумма и дата списания указаны ниже.' }
              : { label: 'Выключено', tone: 'slate' as const, description: canEnable ? 'Можно продлевать вручную или включить оплату с сохранённой карты.' : 'Включить автопродление можно после покупки активного платного тарифа.' }

  return (
    <>
    <section id="auto-renewal" className="scroll-mt-24 overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-white/10 dark:bg-white/[0.025]" aria-labelledby="auto-renewal-title">
      <div className="relative overflow-hidden px-5 py-5 sm:px-6 sm:py-6">
        <div className="pointer-events-none absolute -right-16 -top-20 h-44 w-44 rounded-full bg-cyan-300/15 blur-3xl dark:bg-cyan-300/[0.07]" />
        <div className="relative flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div className="flex min-w-0 items-start gap-3.5">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-cyan-500/10 text-cyan-600 ring-1 ring-cyan-500/10 dark:bg-cyan-300/10 dark:text-cyan-300 dark:ring-cyan-300/10">
              <RefreshCw className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2.5">
                <h2 id="auto-renewal-title" className="text-base font-semibold text-slate-950 dark:text-white">Автопродление</h2>
                <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
              </div>
              <p className="mt-1.5 max-w-2xl text-sm leading-6 text-slate-500 dark:text-slate-400">{status.description}</p>
            </div>
          </div>

          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap xl:justify-end">
            {pause ? (
              <>
              <button className="btn-primary w-full justify-center sm:w-auto" disabled={saving} onClick={() => void resumeAccess()}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                Возобновить доступ
              </button>
              {cancellable ? <button type="button" className="btn-secondary w-full sm:w-auto" disabled={saving} onClick={() => void changeEnabled(false)}>Отключить и отвязать карту</button> : null}
              </>
            ) : saving ? (
              <div className="flex min-h-11 items-center justify-center px-4"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>
            ) : !canEnable || planPriceKopecks == null ? (
              <>
                <Link href="/dashboard/plans?intent=renew" className="btn-secondary w-full sm:w-auto">Выбрать условия продления</Link>
                {cancellable ? <button type="button" className="btn-secondary w-full text-red-600 dark:text-red-300 sm:w-auto" onClick={() => void changeEnabled(false)}>Отключить и отвязать карту</button> : null}
              </>
            ) : pendingMethod ? (
              <>
                <Link href="/dashboard/plans?intent=renew" className="btn-primary w-full justify-center sm:w-auto">
                  Привязать карту <ArrowRight className="h-4 w-4" />
                </Link>
                <button type="button" className="btn-secondary w-full justify-center sm:w-auto" onClick={() => void changeEnabled(false)}>Отменить настройку</button>
              </>
            ) : needsConsent ? (
              <>
                <button type="button" className="btn-primary w-full justify-center sm:w-auto" onClick={() => void changeEnabled(true)}>Подтвердить условия</button>
                <button type="button" className="btn-secondary w-full justify-center sm:w-auto" onClick={() => void changeEnabled(false)}>Отключить</button>
              </>
            ) : renewalPaused ? (
              <>
                <Link href="/dashboard/plans?intent=renew" className="btn-primary w-full justify-center sm:w-auto">Оплатить вручную <ArrowRight className="h-4 w-4" /></Link>
                <button type="button" className="btn-secondary w-full justify-center sm:w-auto" onClick={() => void changeEnabled(false)}>Отвязать карту</button>
              </>
            ) : cancellable ? (
              <button type="button" className="btn-secondary w-full justify-center text-red-600 hover:border-red-200 hover:bg-red-50 dark:text-red-300 dark:hover:border-red-500/20 dark:hover:bg-red-500/[0.07] sm:w-auto" onClick={() => void changeEnabled(false)}>
                Отключить и отвязать карту
              </button>
            ) : (
              <button type="button" className="btn-primary w-full justify-center sm:w-auto" onClick={() => void changeEnabled(true)}>
                Подключить автопродление
              </button>
            )}
          </div>
        </div>
      </div>

      {configured && !pause ? (
        <div className="grid divide-y divide-slate-200 border-t border-slate-200 dark:divide-white/[0.08] dark:border-white/[0.08] lg:grid-cols-3 lg:divide-x lg:divide-y-0">
          <StatusCell
            icon={ReceiptText}
            label="Сумма и период"
            value={state?.consentPriceKopecks != null ? `${formatPrice(state.consentPriceKopecks)} · ${state.consentDurationDays ?? planDurationDays} дн.` : 'Условия не подтверждены'}
            detail={`Тариф «${state?.plan.name ?? planName}» · ${state?.deviceLimit ?? planDeviceLimit} устройств`}
          />
          <StatusCell
            icon={CreditCard}
            label="Карта"
            value={pendingMethod ? 'Ещё не привязана' : state?.paymentMethodTitle ?? 'Сохранена в ЮKassa'}
            detail={pendingMethod ? 'Привяжется после успешной оплаты' : 'Полные данные карты хранит ЮKassa'}
          />
          <StatusCell
            icon={CalendarClock}
            label={retrying ? 'Повторное списание' : 'Следующее списание'}
            value={renewalPaused || needsConsent ? 'Не запланировано' : state?.nextChargeAt ? formatDate(state.nextChargeAt) : pendingMethod ? 'После привязки карты' : 'Дата уточняется'}
            detail={retrying ? `Повторная попытка: ${state.retryCount + 1}` : processing ? 'Платёж уже обрабатывается' : renewalPaused || needsConsent ? 'Требуется ваше действие' : 'Перед окончанием доступа'}
          />
        </div>
      ) : pause ? (
        <div className="flex flex-col gap-3 border-t border-slate-200 bg-amber-50/70 px-5 py-4 dark:border-white/[0.08] dark:bg-amber-300/[0.05] sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div>
            <div className="text-sm font-semibold text-slate-900 dark:text-white">Доступ на паузе</div>
            <div className="mt-0.5 text-xs leading-5 text-slate-500 dark:text-slate-400">Возобновится {pause.pauseUntil ? formatDate(pause.pauseUntil) : 'после вашего подтверждения'}.</div>
          </div>
          <span className="inline-flex items-center gap-2 text-xs font-semibold text-amber-700 dark:text-amber-300"><PauseCircle className="h-4 w-4" /> Оплаченные дни не расходуются</span>
        </div>
      ) : (
        <div className="border-t border-slate-200 bg-slate-50/70 px-5 py-4 text-sm text-slate-600 dark:border-white/10 dark:bg-white/[0.02] dark:text-slate-300 sm:px-6">
          {canEnable && planPriceKopecks != null ? <><strong className="font-semibold">{priceLabel} за {planDurationDays} дн.</strong> · через ЮKassa. Списания включатся после вашего согласия.</> : 'Автоматических списаний нет.'}
        </div>
      )}

      {!pause && (canPause || configured) ? (
        <div className="flex flex-col gap-2 border-t border-slate-200 px-5 py-3 dark:border-white/[0.08] sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <span className="text-xs leading-5 text-slate-500 dark:text-slate-400">
            {configured && state?.consentAcceptedAt
              ? <>Согласие принято {formatDate(state.consentAcceptedAt)}. <Link href="/offer" className="font-semibold text-brand-600 hover:underline dark:text-brand-300">Условия автоплатежей</Link></>
              : 'Не нужен VPN какое-то время? Оплаченные дни можно сохранить на паузе.'}
          </span>
          {canPause ? <button className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-white/[0.06]" onClick={() => setDialog('pause')}>
            <PauseCircle className="h-4 w-4" /> Поставить на паузу
          </button> : null}
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
          : 'Отвяжем карту от кабинета и отключим следующие автоматические списания.'}
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
              <div className="mt-2 text-2xl font-semibold tracking-tight text-slate-950 dark:text-white">{priceLabel}</div>
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
                Я согласен на регулярное списание {priceLabel} каждые {planDurationDays} дней для продления тарифа «{planName}» и принимаю{' '}
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

function StatusBadge({ tone, children }: { tone: 'emerald' | 'cyan' | 'amber' | 'slate'; children: ReactNode }) {
  return (
    <span className={cn(
      'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold',
      tone === 'emerald' && 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
      tone === 'cyan' && 'bg-cyan-500/10 text-cyan-700 dark:text-cyan-300',
      tone === 'amber' && 'bg-amber-500/10 text-amber-800 dark:text-amber-300',
      tone === 'slate' && 'bg-slate-100 text-slate-600 dark:bg-white/[0.07] dark:text-slate-300'
    )}>
      <span className={cn(
        'h-1.5 w-1.5 rounded-full',
        tone === 'emerald' && 'bg-emerald-500',
        tone === 'cyan' && 'bg-cyan-500',
        tone === 'amber' && 'bg-amber-500',
        tone === 'slate' && 'bg-slate-400'
      )} />
      {children}
    </span>
  )
}

function StatusCell({ icon: Icon, label, value, detail }: {
  icon: LucideIcon
  label: string
  value: string
  detail: string
}) {
  return (
    <div className="flex min-w-0 gap-3 px-5 py-4 sm:px-6">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-500 dark:bg-white/[0.055] dark:text-slate-300">
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <div className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">{label}</div>
        <div className="mt-1 truncate text-sm font-semibold text-slate-900 dark:text-white">{value}</div>
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
