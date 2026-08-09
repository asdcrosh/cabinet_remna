'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState, type ComponentType } from 'react'
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  Check,
  CircleOff,
  Clock3,
  CreditCard,
  Database,
  HardDrive,
  Loader2,
  Radio,
  Rocket,
  RefreshCw,
  Send,
  ServerCog,
  TriangleAlert,
  X,
} from 'lucide-react'
import { cn } from '@/lib/cn'
import type {
  SystemHealthCategory,
  SystemHealthCheck,
  SystemHealthReport,
  SystemHealthStatus,
} from '@/lib/system-health'

const categoryOrder: SystemHealthCategory[] = [
  'deployment',
  'payments',
  'sync',
  'workers',
  'communications',
  'watch',
  'backups',
  'core',
]

const categoryView: Record<SystemHealthCategory, { title: string; description: string; icon: ComponentType<{ className?: string }> }> = {
  deployment: { title: 'Обновления', description: 'Версия, миграции и результат деплоя', icon: Rocket },
  payments: { title: 'Платежи', description: 'Операции и провайдеры', icon: CreditCard },
  sync: { title: 'Синхронизация', description: 'Remnawave, Remnashop и выдача', icon: RefreshCw },
  workers: { title: 'Фоновые процессы', description: 'Обработчики и очереди', icon: ServerCog },
  communications: { title: 'Связь', description: 'Telegram и email', icon: Send },
  watch: { title: 'Watch', description: 'Ноды и транспортные каналы', icon: Radio },
  backups: { title: 'Бэкапы', description: 'Локальные архивы и S3', icon: HardDrive },
  core: { title: 'Основа', description: 'База данных кабинета', icon: Database },
}

const statusView: Record<SystemHealthStatus, { label: string; dot: string; text: string; icon: ComponentType<{ className?: string }> }> = {
  ok: { label: 'Работает', dot: 'bg-emerald-500', text: 'text-emerald-700 dark:text-emerald-300', icon: Check },
  warn: { label: 'Внимание', dot: 'bg-amber-400', text: 'text-amber-700 dark:text-amber-300', icon: AlertTriangle },
  error: { label: 'Ошибка', dot: 'bg-red-500', text: 'text-red-700 dark:text-red-300', icon: X },
  off: { label: 'Выключено', dot: 'bg-slate-300 dark:bg-slate-600', text: 'text-slate-500', icon: CircleOff },
}

export function SystemHealthPanel({ initialReport }: { initialReport: SystemHealthReport }) {
  const [report, setReport] = useState(initialReport)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [checkedAtLabel, setCheckedAtLabel] = useState('только что')

  const refresh = useCallback(async (visible = false) => {
    if (visible) setLoading(true)
    setError(null)
    try {
      const response = await fetch('/api/admin/system/health', { method: 'GET', cache: 'no-store' })
      const data = await response.json().catch(() => null)
      if (!response.ok || !data?.checks) throw new Error(data?.error || 'Не удалось получить состояние системы')
      setReport(data as SystemHealthReport)
    } catch (refreshError) {
      if (visible) setError(refreshError instanceof Error ? refreshError.message : 'Неизвестная ошибка')
    } finally {
      if (visible) setLoading(false)
    }
  }, [])

  useEffect(() => {
    const timer = window.setInterval(() => void refresh(false), 60_000)
    return () => window.clearInterval(timer)
  }, [refresh])

  useEffect(() => {
    setCheckedAtLabel(new Date(report.checkedAt).toLocaleString('ru-RU'))
  }, [report.checkedAt])

  const groups = useMemo(() => categoryOrder.map((category) => ({
    category,
    checks: report.checks.filter((item) => item.category === category),
  })).filter((group) => group.checks.length > 0), [report.checks])
  const errors = report.checks.filter((item) => item.status === 'error')
  const warnings = report.checks.filter((item) => item.status === 'warn')
  const working = report.checks.filter((item) => item.status === 'ok').length
  const headline = errors.length > 0
    ? 'Есть критичные проблемы'
    : warnings.length > 0
      ? 'Система работает с замечаниями'
      : 'Все основные контуры работают'

  return (
    <div className="space-y-5" aria-live="polite">
      <section className="overflow-hidden rounded-3xl border border-slate-800 bg-slate-950 text-white shadow-sm dark:border-white/10">
        <div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
              <Activity className="h-4 w-4" /> Операционный статус
            </div>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">{headline}</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
              Один экран для денег, выдачи доступа, интеграций и фоновых процессов. Данные обновляются автоматически раз в минуту.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void refresh(true)}
            disabled={loading}
            className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white/10 px-4 text-sm font-semibold transition hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 disabled:opacity-60 sm:w-auto"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" /> : <RefreshCw className="h-4 w-4" />}
            Обновить
          </button>
        </div>

        <div className="grid grid-cols-3 border-t border-white/10">
          <HeroMetric label="Работает" value={working} tone="text-emerald-300" />
          <HeroMetric label="Внимание" value={warnings.length} tone="text-amber-300" border />
          <HeroMetric label="Ошибки" value={errors.length} tone="text-red-300" border />
        </div>
      </section>

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/25 dark:bg-red-500/10 dark:text-red-200" role="alert">
          {error}
        </div>
      ) : null}

      {(errors.length > 0 || warnings.length > 0) ? (
        <section className="rounded-3xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-white/[0.03] sm:p-5">
          <div className="flex items-center gap-2">
            <TriangleAlert className={cn('h-5 w-5', errors.length > 0 ? 'text-red-500' : 'text-amber-500')} />
            <h2 className="font-semibold">Сначала проверьте</h2>
          </div>
          <div className="mt-4 divide-y divide-slate-100 dark:divide-white/[0.07]">
            {[...errors, ...warnings].slice(0, 5).map((item) => (
              <div key={item.id} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="text-sm font-semibold">{item.title}</div>
                  <div className="mt-0.5 text-sm text-slate-500">{item.message}</div>
                </div>
                {item.actionHref ? <ActionLink item={item} compact /> : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <nav className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:thin]" aria-label="Разделы состояния системы">
        {groups.map(({ category, checks }) => {
          const meta = categoryView[category]
          const state = categoryStatus(checks)
          return (
            <a key={category} href={`#health-${category}`} className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium transition hover:border-slate-300 dark:border-white/10 dark:bg-white/[0.03] dark:hover:border-white/20">
              <span className={cn('h-2 w-2 rounded-full', statusView[state].dot)} />
              {meta.title}
            </a>
          )
        })}
      </nav>

      <div className="space-y-7">
        {groups.map(({ category, checks }) => (
          <HealthGroup key={category} category={category} checks={checks} />
        ))}
      </div>

      <div className="flex items-center gap-2 px-1 text-xs text-slate-400">
        <Clock3 className="h-3.5 w-3.5" /> Проверено {checkedAtLabel}
      </div>
    </div>
  )
}

function HealthGroup({ category, checks }: { category: SystemHealthCategory; checks: SystemHealthCheck[] }) {
  const meta = categoryView[category]
  const Icon = meta.icon
  const state = categoryStatus(checks)
  const view = statusView[state]
  return (
    <section id={`health-${category}`} className="scroll-mt-24" aria-labelledby={`health-${category}-title`}>
      <div className="mb-3 flex items-end justify-between gap-3 px-1">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-2xl bg-slate-100 text-slate-600 dark:bg-white/[0.06] dark:text-slate-300">
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <h2 id={`health-${category}-title`} className="font-semibold">{meta.title}</h2>
            <p className="text-xs text-slate-500">{meta.description}</p>
          </div>
        </div>
        <span className={cn('text-xs font-semibold', view.text)}>{view.label}</span>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {checks.map((item) => <HealthCard key={item.id} item={item} />)}
      </div>
    </section>
  )
}

function HealthCard({ item }: { item: SystemHealthCheck }) {
  const view = statusView[item.status]
  const StatusIcon = view.icon
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-white/[0.03]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-semibold">{item.title}</h3>
          <p className="mt-1 text-sm leading-5 text-slate-500 dark:text-slate-400">{item.message}</p>
        </div>
        <span className={cn('inline-flex shrink-0 items-center gap-1.5 text-xs font-semibold', view.text)}>
          <StatusIcon className="h-3.5 w-3.5" /> {view.label}
        </span>
      </div>

      {item.metrics?.length ? (
        <div className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-xl bg-slate-200 dark:bg-white/10 sm:grid-cols-4">
          {item.metrics.map((metric) => (
            <div key={metric.label} className="bg-slate-50 px-3 py-2.5 dark:bg-[#181b21]">
              <div className={cn(
                'text-lg font-semibold tabular-nums',
                metric.tone === 'positive' && 'text-emerald-600 dark:text-emerald-300',
                metric.tone === 'warning' && 'text-amber-600 dark:text-amber-300',
                metric.tone === 'negative' && 'text-red-600 dark:text-red-300',
              )}>{metric.value}</div>
              <div className="mt-0.5 truncate text-[10px] uppercase tracking-wider text-slate-400">{metric.label}</div>
            </div>
          ))}
        </div>
      ) : null}

      {(item.details || item.actionHref) ? (
        <div className="mt-4 flex flex-col gap-3 border-t border-slate-100 pt-3 dark:border-white/[0.07] sm:flex-row sm:items-end sm:justify-between">
          {item.details ? (
            <details className="min-w-0 text-xs text-slate-500 dark:text-slate-400">
              <summary className="cursor-pointer font-medium">Диагностика</summary>
              <p className="mt-2 break-words leading-5">{item.details}</p>
            </details>
          ) : <span />}
          {item.actionHref ? <ActionLink item={item} /> : null}
        </div>
      ) : null}
    </article>
  )
}

function ActionLink({ item, compact = false }: { item: SystemHealthCheck; compact?: boolean }) {
  if (!item.actionHref) return null
  return (
    <Link href={item.actionHref} className={cn('inline-flex shrink-0 items-center gap-1.5 font-semibold text-slate-700 hover:text-slate-950 dark:text-slate-300 dark:hover:text-white', compact ? 'text-xs' : 'text-xs')}>
      {item.actionLabel || 'Открыть'} <ArrowUpRight className="h-3.5 w-3.5" />
    </Link>
  )
}

function HeroMetric({ label, value, tone, border = false }: { label: string; value: number; tone: string; border?: boolean }) {
  return (
    <div className={cn('px-4 py-4 sm:px-6', border && 'border-l border-white/10')}>
      <div className={cn('text-2xl font-semibold tabular-nums', tone)}>{value}</div>
      <div className="mt-0.5 text-xs text-slate-400">{label}</div>
    </div>
  )
}

function categoryStatus(checks: SystemHealthCheck[]): SystemHealthStatus {
  if (checks.some((item) => item.status === 'error')) return 'error'
  if (checks.some((item) => item.status === 'warn')) return 'warn'
  if (checks.every((item) => item.status === 'off')) return 'off'
  return 'ok'
}
