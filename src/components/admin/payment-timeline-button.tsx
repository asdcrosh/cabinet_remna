'use client'

import { useMemo, useState } from 'react'
import { AlertTriangle, Check, Clock3, RotateCcw, X } from 'lucide-react'
import { AdminModal } from './admin-modal'

type TimelineStatus = 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR'
type TimelineStage = 'ORDER' | 'PROVIDER' | 'WEBHOOK' | 'PAYMENT' | 'PROVISIONING' | 'SUBSCRIPTION' | 'REMNASHOP' | 'NOTIFICATION' | 'REFUND'

interface TimelineEvent {
  id: string
  stage: TimelineStage
  status: TimelineStatus
  source: string
  message: string
  details: unknown
  attempts: number
  createdAt: string
  updatedAt: string
}

export function PaymentTimelineButton({ paymentId, provider, providerStatus, paymentStatus, createdAt, paidAt, provisionedAt, remnashopSyncedAt, job, events }: {
  paymentId: string
  provider: string
  providerStatus: string | null
  paymentStatus: string
  createdAt: string
  paidAt: string | null
  provisionedAt: string | null
  remnashopSyncedAt: string | null
  job: { status: string; attempts: number; nextRetryAt: string | null; lastError: string | null } | null
  events: TimelineEvent[]
}) {
  const [open, setOpen] = useState(false)
  const orderedEvents = useMemo(
    () => [...events].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()),
    [events]
  )

  return (
    <>
      <button type="button" className="btn-secondary w-full min-w-[112px] px-3 text-xs lg:w-auto" onClick={() => setOpen(true)}>
        <Clock3 className="h-3.5 w-3.5" />
        История
      </button>
      <AdminModal open={open} onClose={() => setOpen(false)} title="История платежа" description={`Заказ ${shortId(paymentId)} · ${provider}`} size="lg">
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-slate-200 bg-slate-200 dark:border-white/10 dark:bg-white/10 sm:grid-cols-4">
            <SummaryCell label="Заказ" value={formatDate(createdAt)} />
            <SummaryCell label="Провайдер" value={providerStatus || 'не ответил'} />
            <SummaryCell label="Оплата" value={paymentStatusLabel(paymentStatus)} />
            <SummaryCell label="Выдача" value={provisionedAt ? 'готово' : jobStatusLabel(job?.status)} />
          </div>

          <div className="grid gap-2 rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs dark:border-white/10 dark:bg-white/[0.03] sm:grid-cols-2">
            <Fact label="Оплата подтверждена" value={paidAt ? formatDate(paidAt) : 'нет'} />
            <Fact label="Подписка выдана" value={provisionedAt ? formatDate(provisionedAt) : 'нет'} />
            <Fact label="Remnashop" value={remnashopSyncedAt ? formatDate(remnashopSyncedAt) : 'не синхронизирован'} />
            <Fact label="Попытки выдачи" value={String(job?.attempts ?? 0)} />
            {job?.nextRetryAt ? <Fact label="Следующий повтор" value={formatDate(job.nextRetryAt)} /> : null}
          </div>

          {job?.lastError ? (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-200">
              <div className="font-semibold">Последняя ошибка выдачи</div>
              <div className="mt-1 break-words">{job.lastError}</div>
            </div>
          ) : null}

          <section>
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold">События цепочки</h3>
              <span className="text-xs text-slate-500">{orderedEvents.length}</span>
            </div>
            {orderedEvents.length ? (
              <ol className="relative space-y-0 before:absolute before:bottom-5 before:left-[17px] before:top-5 before:w-px before:bg-slate-200 dark:before:bg-white/10">
                {orderedEvents.map((event) => (
                  <li key={event.id} className="relative grid grid-cols-[36px_minmax(0,1fr)] gap-3 py-2">
                    <span className={`relative z-10 grid h-9 w-9 place-items-center rounded-full border ${eventTone(event.status)}`}>
                      <EventIcon status={event.status} />
                    </span>
                    <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-3 dark:border-white/10 dark:bg-white/[0.025]">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">{stageLabel(event.stage)}</div>
                          <div className="mt-1 text-sm font-medium">{event.message}</div>
                        </div>
                        <time className="shrink-0 text-[11px] text-slate-400">{formatDate(event.updatedAt)}</time>
                      </div>
                      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-500">
                        <span>{event.source}</span>
                        {event.attempts > 1 ? <span>повторов: {event.attempts}</span> : null}
                      </div>
                      {hasDetails(event.details) ? (
                        <details className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-xs dark:bg-black/15">
                          <summary className="cursor-pointer font-medium text-slate-600 dark:text-slate-300">Диагностика</summary>
                          <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words text-[11px] leading-relaxed text-slate-500">{formatDetails(event.details)}</pre>
                        </details>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <div className="rounded-xl border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500 dark:border-white/15">
                Это старый платёж. История начнёт заполняться при следующей проверке или повторе операции.
              </div>
            )}
          </section>
        </div>
      </AdminModal>
    </>
  )
}

function SummaryCell({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0 bg-white p-3 dark:bg-surface-900"><div className="text-[10px] uppercase tracking-wide text-slate-400">{label}</div><div className="mt-1 truncate text-sm font-semibold">{value}</div></div>
}

function Fact({ label, value }: { label: string; value: string }) {
  return <div className="flex min-w-0 justify-between gap-3"><span className="text-slate-500">{label}</span><span className="truncate text-right font-medium text-slate-700 dark:text-slate-200">{value}</span></div>
}

function EventIcon({ status }: { status: TimelineStatus }) {
  if (status === 'SUCCESS') return <Check className="h-4 w-4" />
  if (status === 'ERROR') return <X className="h-4 w-4" />
  if (status === 'WARNING') return <AlertTriangle className="h-4 w-4" />
  return <RotateCcw className="h-4 w-4" />
}

function eventTone(status: TimelineStatus) {
  if (status === 'SUCCESS') return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-emerald-300'
  if (status === 'ERROR') return 'border-red-200 bg-red-50 text-red-700 dark:border-red-500/25 dark:bg-red-500/10 dark:text-red-300'
  if (status === 'WARNING') return 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-300'
  return 'border-slate-200 bg-slate-50 text-slate-500 dark:border-white/10 dark:bg-white/[0.05]'
}

function stageLabel(stage: TimelineStage) {
  return { ORDER: 'Заказ', PROVIDER: 'Провайдер', WEBHOOK: 'Webhook', PAYMENT: 'Оплата', PROVISIONING: 'Выдача', SUBSCRIPTION: 'Подписка', REMNASHOP: 'Remnashop', NOTIFICATION: 'Уведомления', REFUND: 'Возврат' }[stage]
}

function paymentStatusLabel(status: string) {
  return { PENDING: 'ожидает', SUCCEEDED: 'оплачен', CANCELED: 'отменён', REFUNDED: 'возвращён' }[status] || status
}

function jobStatusLabel(status?: string) {
  if (!status) return 'ожидает'
  return { PENDING: 'в очереди', RUNNING: 'выполняется', SUCCEEDED: 'готово', FAILED: 'ошибка' }[status] || status
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(value))
}

function shortId(value: string) {
  return value.length > 14 ? `${value.slice(0, 8)}…${value.slice(-4)}` : value
}

function hasDetails(value: unknown) {
  return Boolean(value && typeof value === 'object' && Object.keys(value as Record<string, unknown>).length)
}

function formatDetails(value: unknown) {
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}
