'use client'

import { useState } from 'react'
import { AlertTriangle, CheckCircle2, RefreshCw } from 'lucide-react'
import { apiFetch } from '@/lib/api-client'

interface RemnashopSyncReport {
  mode: 'dryRun' | 'apply'
  generatedAt: string
  counts: Record<string, number>
  warnings: string[]
  summary?: Record<string, number>
  samples: {
    plans: unknown[]
    promoCodes?: unknown[]
    activeSubscriptions?: unknown[]
    transactions?: unknown[]
  }
}

export function RemnashopSyncPanel() {
  const [loading, setLoading] = useState(false)
  const [report, setReport] = useState<RemnashopSyncReport | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [includePromoCodes, setIncludePromoCodes] = useState(true)

  async function runDryRun() {
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
  }

  async function applyCatalogSync() {
    if (!window.confirm('Синхронизировать пользователей, тарифы и промокоды из remnashop?')) return

    setLoading(true)
    setError(null)
    try {
      const result = await apiFetch<RemnashopSyncReport>(
        `/api/admin/remnashop-sync?apply=1&promoCodes=${includePromoCodes ? '1' : '0'}`
      )
      setReport(result)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось выполнить синхронизацию')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="card space-y-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold">Remnashop</h2>
          <p className="mt-1 text-sm text-slate-500">
            Проверка и перенос пользователей, подписок, тарифов и промокодов.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <button type="button" className="btn-secondary shrink-0" onClick={runDryRun} disabled={loading}>
            <RefreshCw className={loading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
            Проверить
          </button>
          <button type="button" className="btn-primary shrink-0" onClick={applyCatalogSync} disabled={loading}>
            <RefreshCw className={loading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
            Синхронизировать
          </button>
        </div>
        </div>
        <div className="rounded-lg bg-slate-50 p-3 dark:bg-white/5">
          <label className="flex min-h-11 items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 text-sm dark:border-white/10 dark:bg-surface-900">
            <input type="checkbox" checked={includePromoCodes} onChange={(event) => setIncludePromoCodes(event.target.checked)} />
            Синхронизировать промокоды
          </label>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-100">
          {error}
        </div>
      )}

      {report && (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {Object.entries(report.summary ?? report.counts).map(([key, value]) => (
              <Metric key={key} label={labelize(key)} value={value} />
            ))}
          </div>

          {report.warnings.length > 0 ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
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
          ) : (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-100">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4" />
                Критичных предупреждений нет.
              </div>
            </div>
          )}

          <details className="card">
            <summary className="cursor-pointer font-medium">Технические детали</summary>
            <pre className="mt-3 max-h-[28rem] overflow-auto rounded-lg bg-slate-950 p-3 text-xs text-slate-100">
              {JSON.stringify(report.samples, null, 2)}
            </pre>
          </details>
        </>
      )}
    </div>
  )
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="card">
      <div className="text-sm text-slate-500">{label}</div>
      <div className="mt-2 text-2xl font-semibold">{value}</div>
    </div>
  )
}

function labelize(value: string) {
  return syncLabels[value] ?? value.replace(/([A-Z])/g, ' $1').replace(/^./, (char) => char.toUpperCase())
}

function translateError(value: string) {
  if (value.includes('not configured')) return 'Подключение к базе Remnashop не настроено'
  if (value.includes('timeout')) return 'Remnashop не ответил вовремя'
  if (value.includes('password authentication')) return 'Не удалось войти в базу Remnashop'
  return value
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
}
