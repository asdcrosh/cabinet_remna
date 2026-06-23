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

  async function runDryRun() {
    setLoading(true)
    setError(null)
    try {
      const result = await apiFetch<RemnashopSyncReport>('/api/admin/remnashop-sync')
      setReport(result)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось выполнить dry-run')
    } finally {
      setLoading(false)
    }
  }

  async function applyCatalogSync() {
    if (!window.confirm('Синхронизировать тарифы и промокоды из remnashop?')) return

    setLoading(true)
    setError(null)
    try {
      const result = await apiFetch<RemnashopSyncReport>('/api/admin/remnashop-sync?apply=1')
      setReport(result)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось выполнить синхронизацию')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="card flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold">Remnashop</h2>
          <p className="mt-1 text-sm text-slate-500">
            Каталог обновляется автоматически при входе в кабинет. Здесь можно проверить или запустить вручную.
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

          <div className="grid gap-4 xl:grid-cols-2">
            <JsonPanel title="Counts" value={report.counts} />
            <JsonPanel title="Samples" value={report.samples} />
          </div>
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

function JsonPanel({ title, value }: { title: string; value: unknown }) {
  return (
    <div className="card min-w-0">
      <h3 className="mb-3 font-semibold">{title}</h3>
      <pre className="max-h-[32rem] overflow-auto rounded-lg bg-slate-950 p-3 text-xs text-slate-100">
        {JSON.stringify(value, null, 2)}
      </pre>
    </div>
  )
}

function labelize(value: string) {
  return value.replace(/([A-Z])/g, ' $1').replace(/^./, (char) => char.toUpperCase())
}
