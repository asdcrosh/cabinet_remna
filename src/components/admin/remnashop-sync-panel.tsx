'use client'

import type { ReactNode } from 'react'
import { useCallback, useEffect, useState } from 'react'
import { Activity, AlertTriangle, Clock3, RefreshCw, RotateCcw } from 'lucide-react'
import { apiFetch } from '@/lib/api-client'
import { toast } from '@/components/ui/toaster'
import { AdminEmptyState } from '@/components/admin/admin-empty-state'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Checkbox } from '@/components/ui/checkbox'

interface RemnashopPlanDiff {
  sourceId: number
  name: string
  durationDays: number
  priceKopecks: number
  trafficLimitGb: number | null
  deviceLimit: number
  existsInCabinet: boolean
  action: string
}

interface RemnashopSubscriptionDiff {
  sourceId: number
  userId: number
  userRemnaId: string
  status: string
  expireAt: string
  deviceLimit: number
  trafficLimitGb: number | null
  hasCabinetUser: boolean
  hasCabinetSubscription: boolean
}

interface RemnashopTransactionDiff {
  sourceId: number
  paymentId: string
  status: string
  mappedStatus: string
  userRemnaId: string | null
  hasCabinetUser: boolean
  existsInCabinet: boolean
  action: string
}

interface RemnashopSyncReport {
  mode: 'dryRun' | 'apply'
  generatedAt: string
  counts: Record<string, number>
  warnings: string[]
  summary?: Record<string, number>
  samples: {
    plans: RemnashopPlanDiff[]
    promoCodes?: unknown[]
    activeSubscriptions?: RemnashopSubscriptionDiff[]
    transactions?: RemnashopTransactionDiff[]
  }
  syncEvents?: SyncEventRow[]
  syncStatusCounts?: Record<string, number>
  syncIssueGroups?: SyncIssueGroup[]
  integration?: RemnashopIntegrationStatus
}

interface RemnashopIntegrationStatus {
  state: 'READY' | 'PARTIAL' | 'READ_ONLY' | 'NOT_CONFIGURED' | 'ERROR'
  database: {
    configured: boolean
    connected: boolean
    writable: boolean
  }
  api: {
    configured: boolean
  }
  events: {
    configured: boolean
    mode: 'REALTIME' | 'POLLING'
  }
  passwordReset: {
    configured: boolean
  }
  channels: Record<'users' | 'catalog' | 'payments' | 'promoCodes', 'READY' | 'READ_ONLY' | 'UNAVAILABLE'>
  message: string
}

interface SyncEventRow {
  id: string
  direction: 'CABINET_TO_REMNASHOP' | 'REMNASHOP_TO_CABINET'
  entityType: string
  entityId: string
  operation: string
  status: 'PENDING' | 'SUCCEEDED' | 'FAILED' | 'SKIPPED'
  attempts: number
  lastError: string | null
  nextRetryAt: string | null
  lastSyncedAt: string | null
  updatedAt: string
  requiresAttention: boolean
}

interface SyncIssueGroup {
  direction: 'CABINET_TO_REMNASHOP' | 'REMNASHOP_TO_CABINET'
  entityType: string
  operation: string
  status: 'FAILED' | 'SKIPPED'
  reason: string
  count: number
  lastSeenAt: string
}

export function RemnashopSyncPanel() {
  const [loading, setLoading] = useState(false)
  const [report, setReport] = useState<RemnashopSyncReport | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [includePromoCodes, setIncludePromoCodes] = useState(true)
  const [applyConfirmOpen, setApplyConfirmOpen] = useState(false)

  const runDryRun = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await apiFetch<RemnashopSyncReport>('/api/admin/remnashop-sync')
      setReport(result)
    } catch (e) {
      setError(e instanceof Error ? translateError(e.message) : 'Не удалось проверить данные')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void runDryRun()
  }, [runDryRun])

  async function applyCatalogSync() {
    setLoading(true)
    setError(null)
    try {
      const result = await apiFetch<RemnashopSyncReport>('/api/admin/remnashop-sync', {
        method: 'POST',
        body: JSON.stringify({ promoCodes: includePromoCodes }),
      })
      setReport(result)
      setApplyConfirmOpen(false)
    } catch (e) {
      setError(e instanceof Error ? translateError(e.message) : 'Не удалось выполнить синхронизацию')
    } finally {
      setLoading(false)
    }
  }

  async function retryEvent(id: string) {
    setLoading(true)
    setError(null)
    try {
      await apiFetch('/api/admin/remnashop-sync/retry', {
        method: 'POST',
        body: JSON.stringify({ id }),
      })
      toast('Повтор синхронизации выполнен', 'success')
      await runDryRun()
    } catch (e) {
      setError(e instanceof Error ? translateError(e.message) : 'Не удалось повторить синхронизацию')
    } finally {
      setLoading(false)
    }
  }

  async function retryFailedEvents() {
    if ((report?.syncStatusCounts?.FAILED ?? 0) === 0) return
    setLoading(true)
    setError(null)
    try {
      const retry = await apiFetch<{
        result: { attempted: number; succeeded: number; failed: number }
      }>('/api/admin/remnashop-sync/retry', {
        method: 'POST',
        body: JSON.stringify({ allFailed: true }),
      })
      toast(
        retry.result.failed > 0
          ? `Исправлено: ${retry.result.succeeded}, осталось: ${retry.result.failed}`
          : `Исправлено событий: ${retry.result.succeeded}`,
        retry.result.failed > 0 ? 'error' : 'success'
      )
      const result = await apiFetch<RemnashopSyncReport>('/api/admin/remnashop-sync')
      setReport(result)
    } catch (e) {
      setError(e instanceof Error ? translateError(e.message) : 'Не удалось повторить ошибки')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      <section className="rounded-3xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-white/[0.035] sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold">Remnashop</h2>
            <p className="mt-1 text-sm text-slate-500">
              Общие пользователи, тарифы, подписки, платежи и промокоды в обе стороны.
            </p>
          </div>
          <div className="grid w-full grid-cols-1 gap-2 sm:w-auto sm:grid-cols-2">
            <button type="button" className="btn-secondary w-full" onClick={runDryRun} disabled={loading}>
              <RefreshCw className={loading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
              Обновить статус
            </button>
            <button type="button" className="btn-primary w-full" onClick={() => setApplyConfirmOpen(true)} disabled={loading}>
              <RefreshCw className={loading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
              Синхронизировать
            </button>
          </div>
        </div>
        <Checkbox
          checked={includePromoCodes}
          onChange={(event) => setIncludePromoCodes(event.target.checked)}
          label="Промокоды"
          description="Включить их в текущую синхронизацию"
          className="mt-4 flex w-full flex-row-reverse items-center justify-between border-y border-slate-200/90 py-3 dark:border-white/[0.09]"
        />
      </section>

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-100" role="alert">
          {error}
        </div>
      )}

      {report && (
        <>
          {report.integration ? <IntegrationStatus status={report.integration} /> : null}
          <SyncOverview report={report} />

          {report.warnings.length > 0 ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
              <div className="mb-2 flex items-center gap-2 font-medium">
                <AlertTriangle className="h-4 w-4" />
                Предупреждения
              </div>
              <ul className="list-disc space-y-1 pl-5">
                {report.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <SyncEventsView
            events={report.syncEvents ?? []}
            issueGroups={report.syncIssueGroups ?? []}
            failedCount={report.syncStatusCounts?.FAILED ?? 0}
            loading={loading}
            onRetry={(id) => void retryEvent(id)}
            onRetryFailed={() => void retryFailedEvents()}
          />

          <details className="card">
            <summary className="cursor-pointer font-medium">Результаты проверки и расхождения</summary>
            <div className="mt-4 flex flex-wrap gap-2">
              {Object.entries(report.summary ?? report.counts).slice(0, 8).map(([key, value]) => (
                <Metric key={key} label={labelize(key)} value={value} />
              ))}
            </div>
            <div className="mt-4"><DiffView report={report} /></div>
          </details>

          <details className="card">
            <summary className="cursor-pointer font-medium">Технические детали</summary>
            <pre className="mt-3 max-h-[28rem] overflow-auto rounded-xl bg-slate-950 p-3 text-xs text-slate-100">
              {JSON.stringify(report.samples, null, 2)}
            </pre>
          </details>
        </>
      )}
      <ConfirmDialog
        open={applyConfirmOpen}
        title="Запустить синхронизацию"
        description="Пользователи, тарифы, подписки, платежи и поддерживаемые промокоды будут синхронизированы из Remnashop в кабинет."
        confirmLabel="Синхронизировать"
        loading={loading}
        onConfirm={() => void applyCatalogSync()}
        onCancel={() => setApplyConfirmOpen(false)}
      />
    </div>
  )
}

function IntegrationStatus({ status }: { status: RemnashopIntegrationStatus }) {
  const channels = [
    ['users', 'Пользователи', 'Регистрация, вход и связь аккаунтов'],
    ['catalog', 'Тарифы', 'Каталог и сроки подписки'],
    ['payments', 'Платежи', 'Оплаты и выданные подписки'],
    ['promoCodes', 'Промокоды', 'Глобальные скидки на покупку'],
  ] as const

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-white/10 dark:bg-white/[0.035]">
      <div className="flex flex-col gap-2 border-b border-slate-200 px-4 py-4 dark:border-white/10 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="font-semibold text-slate-950 dark:text-white">Что реально подключено</h3>
          <p className="mt-1 text-sm text-slate-500">{status.message}</p>
        </div>
        <span className={integrationStateClass(status.state)}>
          {integrationStateLabel(status.state)}
        </span>
      </div>
      <div className="grid divide-y divide-slate-200 dark:divide-white/10 md:grid-cols-2 md:divide-x md:divide-y-0 xl:grid-cols-4">
        {channels.map(([key, title, description]) => (
          <div key={key} className="flex min-h-28 flex-col justify-between gap-4 px-4 py-4">
            <div>
              <div className="text-sm font-semibold text-slate-950 dark:text-white">{title}</div>
              <div className="mt-1 text-xs leading-5 text-slate-500">{description}</div>
            </div>
            <span className={channelStateClass(status.channels[key])}>
              {channelStateLabel(status.channels[key])}
            </span>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-2 border-t border-slate-200 px-4 py-3 text-xs text-slate-500 dark:border-white/10">
        <span>База: {status.database.connected ? (status.database.writable ? 'чтение и запись' : 'только чтение') : 'нет связи'}</span>
        <span>API входа: {status.api.configured ? 'настроен' : 'не настроен'}</span>
        <span>События: {status.events.mode === 'REALTIME' ? 'приём включён + резервный опрос' : 'только опрос'}</span>
        <span>
          Сброс пароля: {status.passwordReset.configured ? 'синхронизируется' : 'только в Cabinet'}
        </span>
      </div>
    </section>
  )
}

function integrationStateLabel(state: RemnashopIntegrationStatus['state']) {
  if (state === 'READY') return 'Интеграция работает'
  if (state === 'READ_ONLY') return 'Только чтение'
  if (state === 'PARTIAL') return 'Работает частично'
  if (state === 'ERROR') return 'Ошибка подключения'
  return 'Не настроено'
}

function integrationStateClass(state: RemnashopIntegrationStatus['state']) {
  if (state === 'READY') return 'badge-active shrink-0'
  if (state === 'ERROR') return 'badge-disabled shrink-0'
  if (state === 'NOT_CONFIGURED') return 'badge-muted shrink-0'
  return 'badge-limited shrink-0'
}

function channelStateLabel(state: RemnashopIntegrationStatus['channels'][keyof RemnashopIntegrationStatus['channels']]) {
  if (state === 'READY') return 'Работает'
  if (state === 'READ_ONLY') return 'Только из Remnashop'
  return 'Недоступно'
}

function channelStateClass(state: RemnashopIntegrationStatus['channels'][keyof RemnashopIntegrationStatus['channels']]) {
  if (state === 'READY') return 'badge-active w-fit'
  if (state === 'READ_ONLY') return 'badge-limited w-fit'
  return 'badge-muted w-fit'
}

function SyncEventsView({
  events,
  issueGroups,
  failedCount,
  loading,
  onRetry,
  onRetryFailed,
}: {
  events: SyncEventRow[]
  issueGroups: SyncIssueGroup[]
  failedCount: number
  loading: boolean
  onRetry: (id: string) => void
  onRetryFailed: () => void
}) {
  const [showHistory, setShowHistory] = useState(false)
  const [directionFilter, setDirectionFilter] = useState<'ALL' | SyncEventRow['direction']>('ALL')
  const [entityFilter, setEntityFilter] = useState('ALL')
  const baseEvents = showHistory
    ? events
    : events.filter((event) => event.requiresAttention)
  const visibleEvents = baseEvents.filter((event) =>
    (directionFilter === 'ALL' || event.direction === directionFilter) &&
    (entityFilter === 'ALL' || event.entityType === entityFilter)
  )
  const entityTypes = Array.from(new Set(events.map((event) => event.entityType))).sort()

  return (
    <section className="space-y-3">
      {issueGroups.length > 0 ? (
        <div className="overflow-hidden rounded-2xl border border-amber-200 bg-white text-sm dark:border-amber-500/25 dark:bg-surface-900">
          <div className="flex items-center gap-2 border-b border-amber-100 px-4 py-3 font-semibold text-slate-950 dark:border-amber-500/15 dark:text-white">
            <AlertTriangle className="h-4 w-4" />
            Требуют внимания
          </div>
          <div className="divide-y divide-slate-100 dark:divide-white/10">
            {issueGroups.map((group) => (
              <div
                key={`${group.direction}:${group.entityType}:${group.operation}:${group.status}:${group.reason}`}
                className="px-4 py-3"
              >
                <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="font-medium">
                      {directionLabel(group.direction)} · {entityLabel(group.entityType)} · {syncStatusLabel(group.status)}
                    </div>
                    <div className="mt-1 break-words text-xs text-slate-500 dark:text-slate-400">{humanIssueReason(group.reason)}</div>
                    {humanIssueAction(group.reason) ? (
                      <div className="mt-2 text-xs font-medium text-slate-700 dark:text-slate-200">
                        Что делать: {humanIssueAction(group.reason)}
                      </div>
                    ) : null}
                  </div>
                  <div className="shrink-0 text-xs text-slate-400">
                    {group.count} шт. · {formatDateTime(group.lastSeenAt)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-white/10 dark:bg-white/[0.035]">
        <div className="flex flex-col gap-3 border-b px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-sm font-semibold">События синхронизации</h3>
            <p className="mt-1 text-xs text-slate-500">
              По умолчанию показаны только записи, которые требуют внимания.
            </p>
          </div>
          <div className="grid w-full gap-2 sm:flex sm:w-auto sm:flex-wrap">
            <select className="input h-10 w-full py-1.5 sm:w-auto sm:min-w-36" value={directionFilter} onChange={(event) => setDirectionFilter(event.target.value as 'ALL' | SyncEventRow['direction'])} aria-label="Направление синхронизации">
              <option value="ALL">Оба направления</option>
              <option value="CABINET_TO_REMNASHOP">Cabinet → Remnashop</option>
              <option value="REMNASHOP_TO_CABINET">Remnashop → Cabinet</option>
            </select>
            <select className="input h-10 w-full py-1.5 sm:w-auto sm:min-w-32" value={entityFilter} onChange={(event) => setEntityFilter(event.target.value)} aria-label="Тип записи">
              <option value="ALL">Все типы</option>
              {entityTypes.map((type) => <option key={type} value={type}>{entityLabel(type)}</option>)}
            </select>
            <button type="button" className="btn-secondary h-10 w-full px-3 sm:w-auto" onClick={() => setShowHistory((value) => !value)}>
              <Clock3 className="h-4 w-4" />
              {showHistory ? 'Скрыть успешные' : 'Показать историю'}
            </button>
            {failedCount > 0 ? (
              <button type="button" className="btn-primary h-10 w-full px-3 sm:w-auto" onClick={onRetryFailed} disabled={loading}>
                <RotateCcw className="h-4 w-4" />
                Повторить ошибки ({failedCount})
              </button>
            ) : null}
          </div>
        </div>
        {visibleEvents.length > 0 ? (
          <div className="divide-y">
            {visibleEvents.map((event) => (
              <div key={event.id} className="grid gap-3 px-4 py-3 md:grid-cols-[minmax(12rem,1fr)_8rem_minmax(12rem,1fr)_auto] md:items-center">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold">
                    {directionLabel(event.direction)} · {entityLabel(event.entityType)}
                  </div>
                  <div className="mt-0.5 truncate font-mono text-xs text-slate-500">{event.entityId}</div>
                </div>
                <div>
                  <span className={statusClass(event.status)}>{syncStatusLabel(event.status)}</span>
                  <div className="mt-1 text-xs text-slate-500">попыток: {event.attempts}</div>
                </div>
                <div className="min-w-0 text-xs text-slate-500">
                  {event.lastError ? (
                    <div className="line-clamp-2 text-amber-600 dark:text-amber-300" title={event.lastError}>{humanIssueReason(event.lastError)}</div>
                  ) : (
                    <div>обновлено {formatDateTime(event.updatedAt)}</div>
                  )}
                  {event.nextRetryAt ? <div>следующая попытка: {formatDateTime(event.nextRetryAt)}</div> : null}
                </div>
                {event.requiresAttention ? (
                  <button
                    type="button"
                    className="btn-secondary h-10 w-full px-3 md:w-auto"
                    onClick={() => onRetry(event.id)}
                    disabled={loading}
                  >
                    <RotateCcw className="h-4 w-4" />
                    Повторить
                  </button>
                ) : (
                  <span className="text-xs text-slate-400 md:text-right">Действий не требуется</span>
                )}
              </div>
            ))}
          </div>
        ) : (
          <AdminEmptyState
            title={events.length > 0 ? 'Активных проблем нет' : 'Событий пока нет'}
            description={events.length > 0 ? 'Успешные записи доступны в полной истории.' : 'События появятся после запуска проверки или синхронизации.'}
            surface="plain"
            className="m-4"
          />
        )}
      </div>
    </section>
  )
}

function SyncOverview({ report }: { report: RemnashopSyncReport }) {
  const failed = report.syncStatusCounts?.FAILED ?? 0
  const pending = report.syncStatusCounts?.PENDING ?? 0
  const skipped = report.syncStatusCounts?.SKIPPED ?? 0
  const warnings = report.warnings.length
  const healthy = failed === 0 && pending === 0 && warnings === 0

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-white/[0.035] sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-center gap-3">
        <span className={healthy ? 'grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-200' : 'grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-200'}>
          <Activity className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <div className="font-semibold text-slate-950 dark:text-white">{healthy ? 'Синхронизация в порядке' : 'Нужно внимание'}</div>
          <div className="mt-0.5 text-xs text-slate-500">Проверено {formatDateTime(report.generatedAt)}</div>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-4 text-center sm:text-right">
        <OverviewMetric label="Ошибки" value={failed} tone={failed > 0 ? 'red' : 'slate'} />
        <OverviewMetric label="Ожидают" value={pending} tone={pending > 0 ? 'amber' : 'slate'} />
        <OverviewMetric label="Пропущено" value={skipped} tone="slate" />
      </div>
    </section>
  )
}

function OverviewMetric({ label, value, tone }: { label: string; value: number; tone: 'red' | 'amber' | 'slate' }) {
  const valueClass = tone === 'red'
    ? 'text-red-600 dark:text-red-300'
    : tone === 'amber'
      ? 'text-amber-600 dark:text-amber-300'
      : 'text-slate-800 dark:text-slate-100'
  return (
    <div>
      <div className={`text-xl font-semibold tabular-nums ${valueClass}`}>{value}</div>
      <div className="text-xs text-slate-500">{label}</div>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="inline-flex items-baseline gap-2 rounded-full bg-slate-50 px-3 py-2 text-sm dark:bg-white/5">
      <span className="text-slate-500">{label}</span>
      <span className="font-semibold tabular-nums text-slate-900 dark:text-white">{value}</span>
    </div>
  )
}

function DiffView({ report }: { report: RemnashopSyncReport }) {
  const plansToCreate = report.samples.plans.filter((item) => item.action === 'wouldCreate')
  const subscriptionsToSync = (report.samples.activeSubscriptions ?? []).filter(
    (item) => item.hasCabinetUser && !item.hasCabinetSubscription
  )
  const blockedPayments = (report.samples.transactions ?? []).filter((item) => item.action === 'blockedNoCabinetUser')
  const paymentsToCreate = (report.samples.transactions ?? []).filter((item) => item.action === 'wouldCreate')

  if (report.mode !== 'dryRun') {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-100">
        Синхронизация выполнена. Для свежего diff нажмите “Проверить”.
      </div>
    )
  }

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <DiffSection
        title="Тарифы к созданию"
        empty="Новых тарифов нет"
        items={plansToCreate}
        render={(item) => (
          <DiffLine
            key={`${item.sourceId}:${item.durationDays}`}
            title={item.name}
            meta={`${item.durationDays} дн. · ${formatRub(item.priceKopecks)} · ${item.deviceLimit} устр.`}
            tone="cyan"
          />
        )}
      />
      <DiffSection
        title="Подписки к обновлению"
        empty="Расхождений по подпискам нет"
        items={subscriptionsToSync}
        render={(item) => (
          <DiffLine
            key={item.sourceId}
            title={`Remnawave ${item.userRemnaId}`}
            meta={`до ${formatDate(item.expireAt)} · Remnashop user ${item.userId}`}
            tone="emerald"
          />
        )}
      />
      <DiffSection
        title="Новые платежи"
        empty="Новых платежей нет"
        items={paymentsToCreate}
        render={(item) => (
          <DiffLine
            key={item.sourceId}
            title={item.paymentId}
            meta={`${item.status} → ${item.mappedStatus}`}
            tone="emerald"
          />
        )}
      />
      <DiffSection
        title="Платежи без пользователя"
        empty="Блокировок нет"
        items={blockedPayments}
        render={(item) => (
          <DiffLine
            key={item.sourceId}
            title={item.paymentId}
            meta={item.userRemnaId ? `Remnawave ${item.userRemnaId}` : 'Нет Remnawave ID'}
            tone="amber"
          />
        )}
      />
    </div>
  )
}

function DiffSection<T>({
  title,
  empty,
  items,
  render,
}: {
  title: string
  empty: string
  items: T[]
  render: (item: T) => ReactNode
}) {
  return (
    <section className="card space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-slate-950 dark:text-white">{title}</h3>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600 dark:bg-white/10 dark:text-slate-300">
          {items.length}
        </span>
      </div>
      {items.length > 0 ? (
        <div className="space-y-2">
          {items.slice(0, 8).map(render)}
          {items.length > 8 && (
            <div className="text-xs text-slate-500">Еще {items.length - 8} записей в технических деталях</div>
          )}
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500 dark:border-white/10 dark:bg-white/[0.04]">
          {empty}
        </div>
      )}
    </section>
  )
}

function DiffLine({ title, meta, tone }: { title: string; meta: string; tone: 'cyan' | 'emerald' | 'amber' }) {
  const toneClass =
    tone === 'emerald'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-emerald-100'
      : tone === 'amber'
        ? 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-100'
        : 'border-cyan-200 bg-cyan-50 text-cyan-800 dark:border-cyan-500/25 dark:bg-cyan-500/10 dark:text-cyan-100'

  return (
    <div className={`rounded-xl border px-3 py-2 ${toneClass}`}>
      <div className="truncate text-sm font-semibold">{title}</div>
      <div className="mt-0.5 truncate text-xs opacity-75">{meta}</div>
    </div>
  )
}

function labelize(value: string) {
  return syncLabels[value] ?? value.replace(/([A-Z])/g, ' $1').replace(/^./, (char) => char.toUpperCase())
}

function formatRub(value: number) {
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    maximumFractionDigits: 0,
  }).format(value / 100)
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(value))
}

function translateError(value: string) {
  if (value.includes('not configured')) return 'Подключение к базе Remnashop не настроено'
  if (value.includes('timeout')) return 'Remnashop не ответил вовремя'
  if (value.includes('password authentication')) return 'Не удалось войти в базу Remnashop'
  if (value.includes('promo code table is not writable')) {
    return 'У Cabinet нет прав на запись промокодов в Remnashop. Запустите обновление сервера и повторите проверку.'
  }
  if (/permission denied/i.test(value)) {
    return 'У пользователя базы Remnashop недостаточно прав для этой операции'
  }
  return value
}

function directionLabel(value: SyncEventRow['direction']) {
  return value === 'CABINET_TO_REMNASHOP' ? 'Cabinet -> Remnashop' : 'Remnashop -> Cabinet'
}

function entityLabel(value: string) {
  if (value === 'payment') return 'Платеж'
  if (value === 'promoCode') return 'Промокод'
  if (value === 'promoCodeConfig') return 'Настройка промокодов'
  if (value === 'user') return 'Пользователь'
  if (value === 'telegramIdentity') return 'Связь Telegram'
  return value
}

function syncStatusLabel(value: string) {
  if (value === 'FAILED') return 'Ошибки'
  if (value === 'PENDING') return 'Ожидают'
  if (value === 'SKIPPED') return 'Пропущены'
  if (value === 'SUCCEEDED') return 'Успешно'
  return value
}

function statusClass(status: SyncEventRow['status']) {
  if (status === 'SUCCEEDED') return 'badge-active'
  if (status === 'FAILED') return 'badge-disabled'
  if (status === 'PENDING') return 'badge-limited'
  return 'badge-muted'
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString('ru-RU')
}

function humanIssueReason(value: string) {
  if (value.includes('promo code table is not writable')) {
    return 'У пользователя базы Remnashop нет прав на запись промокодов.'
  }
  if (value.includes('promo code table not found')) {
    return 'Таблица промокодов Remnashop не найдена.'
  }
  if (value.includes('promo code schema is not recognized')) {
    return 'Cabinet не распознал структуру таблицы промокодов Remnashop.'
  }
  if (value.includes('internal_squads')) {
    return 'При записи платежей Remnashop требует internal_squads. Код теперь отправляет squads тарифа или пустой список, после retry эта ошибка должна уйти.'
  }
  if (value.includes('is_trial')) {
    return 'Remnashop требует is_trial для подписок. Код отправляет false; если ошибка останется, значит в старой записи/триггере Remnashop нужно поставить дефолт.'
  }
  if (value.includes('не хватает прав')) {
    return 'У пользователя базы Remnashop нет прав на запись промокодов. Нужно выдать INSERT/UPDATE/DELETE/SELECT на таблицу промокодов и таблицу связей с тарифами.'
  }
  if (value.includes('нет прав на запись промокодов')) {
    return 'У пользователя базы Remnashop нет прав на запись промокодов. Нужно выдать INSERT/UPDATE/DELETE/SELECT на таблицу промокодов и таблицу связей с тарифами.'
  }
  if (value.includes('таблица промокодов')) {
    return 'Кабинет не понял структуру промокодов Remnashop. Нужно проверить реальные названия таблицы и колонок промокодов в базе Remnashop.'
  }
  if (value.includes('Личный промокод нельзя')) return value
  if (value.includes('Аудитория «без активной подписки»')) return value
  if (value.includes('ограничивать скидочный промокод выбранными тарифами')) return value
  if (value.includes('дату начала действия промокода')) return value
  if (value.includes('одно использование или безлимит')) return value
  if (value.includes('Пользователь ещё не связан')) {
    return 'Платёж нельзя отправить в Remnashop, пока пользователь не найден или не создан там. После синхронизации пользователей нажмите retry по платежам.'
  }
  if (value === 'Причина не записана') return value
  return value
}

function humanIssueAction(value: string) {
  if (
    value.includes('Нет прав на запись промокодов') ||
    value.includes('не хватает прав') ||
    value.includes('нет прав на запись промокодов') ||
    value.includes('promo code table is not writable')
  ) {
    return 'обновить Cabinet на сервере, затем нажать «Синхронизировать».'
  }
  if (value.includes('Не распознана таблица промокодов') || value.includes('таблица промокодов')) {
    return 'проверить версию Remnashop и повторно запустить обновление Cabinet.'
  }
  if (value.includes('Пользователь ещё не связан')) {
    return 'сначала синхронизировать пользователей, затем повторить платежи.'
  }
  if (value.includes('internal_squads') || value.includes('is_trial')) {
    return 'обновить Cabinet и повторить ошибочные события.'
  }
  return null
}

const syncLabels: Record<string, string> = {
  remnashopUsers: 'Пользователей в Remnashop',
  remnashopUsersWithEmail: 'Пользователей с email',
  remnashopVerifiedEmails: 'Подтверждённых email',
  remnashopTelegramOnlyUsers: 'Только с Telegram',
  remnashopUsersWithCurrentSubscription: 'С активной подпиской',
  remnashopPlans: 'Тарифов в Remnashop',
  remnashopPromoCodes: 'Промокодов в Remnashop',
  remnashopSubscriptions: 'Подписок в Remnashop',
  remnashopActiveSubscriptions: 'Активных подписок',
  remnashopTransactions: 'Платежей в Remnashop',
  cabinetMatchedUsers: 'Связано пользователей',
  cabinetMatchedSubscriptions: 'Связано подписок',
  cabinetMatchedPayments: 'Связано платежей',
  plansWouldCreate: 'Будет создано тарифов',
  promoCodesWouldUpsert: 'Будет обновлено промокодов',
  usersWouldNeedIdentityDecision: 'Требуют проверки',
  subscriptionsWouldCreateOrUpdate: 'Будет обновлено подписок',
  paymentsWouldCreate: 'Будет добавлено платежей',
  paymentsBlockedNoCabinetUser: 'Платежей без пользователя',
  plansCreated: 'Создано тарифов',
  plansUpdated: 'Обновлено тарифов',
  promoCodesCreated: 'Создано промокодов',
  promoCodesUpdated: 'Обновлено промокодов',
  promoCodesSkipped: 'Пропущено промокодов',
  usersCreated: 'Создано пользователей',
  usersUpdated: 'Обновлено пользователей',
  usersSkipped: 'Пропущено пользователей',
  subscriptionsSynced: 'Синхронизировано подписок',
  subscriptionsSkipped: 'Пропущено подписок',
  subscriptionsFailed: 'Ошибок подписок',
  paymentsCreated: 'Добавлено платежей',
  paymentsSkipped: 'Платежей уже было',
  paymentsBlocked: 'Платежей требуют связи',
}
