'use client'

import { useState } from 'react'
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, XCircle } from 'lucide-react'
import { cn } from '@/lib/cn'
import type { SystemHealthReport, SystemHealthStatus } from '@/lib/system-health'

const statusView: Record<SystemHealthStatus, { label: string; className: string; icon: React.ReactNode }> = {
  ok: {
    label: 'Готово',
    className: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-emerald-200',
    icon: <CheckCircle2 className="h-4 w-4" />,
  },
  warn: {
    label: 'Внимание',
    className: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-200',
    icon: <AlertTriangle className="h-4 w-4" />,
  },
  error: {
    label: 'Ошибка',
    className: 'border-red-200 bg-red-50 text-red-700 dark:border-red-500/25 dark:bg-red-500/10 dark:text-red-200',
    icon: <XCircle className="h-4 w-4" />,
  },
}

export function SystemHealthPanel({ initialReport }: { initialReport: SystemHealthReport }) {
  const [report, setReport] = useState(initialReport)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function runFullCheck() {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch('/api/admin/system/health', {
        method: 'POST',
        cache: 'no-store',
      })
      const data = await response.json().catch(() => null)
      if (!response.ok || !data?.checks) {
        throw new Error(data?.error || 'Не удалось выполнить проверку')
      }
      setReport(data as SystemHealthReport)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Неизвестная ошибка')
    } finally {
      setLoading(false)
    }
  }

  const errors = report.checks.filter((item) => item.status === 'error').length
  const warnings = report.checks.filter((item) => item.status === 'warn').length

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-white/[0.035]" aria-busy={loading}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-sm font-medium uppercase tracking-wide text-slate-400">Состояние</div>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight">
              {report.ok ? 'Система готова' : 'Есть пункты для проверки'}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Ошибки: {errors} · Предупреждения: {warnings} · {new Date(report.checkedAt).toLocaleString('ru-RU')}
            </p>
          </div>
          <button
            type="button"
            onClick={runFullCheck}
            disabled={loading}
            className="btn-primary w-full sm:w-auto"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Запустить полную проверку
          </button>
        </div>
        {error && (
          <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-500/25 dark:bg-red-500/10 dark:text-red-200" role="alert">
            {error}
          </div>
        )}
      </section>

      <div className="space-y-2">
        {report.checks.map((item) => {
          const view = statusView[item.status]
          return (
            <article
              key={item.id}
              className={cn(
                'rounded-2xl border bg-white p-3 dark:bg-white/[0.035]',
                item.status === 'error'
                  ? 'border-red-200 dark:border-red-500/30'
                  : item.status === 'warn'
                    ? 'border-amber-200 dark:border-amber-500/30'
                    : 'border-slate-200 dark:border-white/10'
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate text-base font-semibold">{item.title}</h3>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{item.message}</p>
                </div>
                <span
                  className={cn(
                    'inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold',
                    view.className
                  )}
                >
                  {view.icon}
                  {view.label}
                </span>
              </div>
              {item.details ? (
                <details className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                  <summary className="cursor-pointer font-medium">Подробнее</summary>
                  <div className="mt-2 rounded-xl bg-slate-50 px-3 py-2 leading-5 dark:bg-white/5">{item.details}</div>
                </details>
              ) : null}
            </article>
          )
        })}
      </div>
    </div>
  )
}
