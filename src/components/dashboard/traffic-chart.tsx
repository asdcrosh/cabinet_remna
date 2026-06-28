'use client'

import { useEffect, useMemo, useState } from 'react'
import { Activity, CalendarDays, Radio, TrendingUp, Zap } from 'lucide-react'
import { apiFetch } from '@/lib/api-client'
import { formatBytes } from '@/lib/format'

interface SeriesPoint {
  date: string
  bytes: string
}

interface TrafficUsageResponse {
  series: SeriesPoint[]
  usedBytes: string
  limitBytes: string | null
  lifetimeBytes: string
  historyAvailable: boolean
  warning?: string
}

export function TrafficChart({
  userId,
  initialUsedBytes,
  initialLimitBytes,
}: {
  userId: string
  initialUsedBytes: string
  initialLimitBytes: string | null
}) {
  const [data, setData] = useState<TrafficUsageResponse>({
    series: [],
    usedBytes: initialUsedBytes,
    limitBytes: initialLimitBytes,
    lifetimeBytes: initialUsedBytes,
    historyAvailable: false,
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    apiFetch<TrafficUsageResponse>('/api/subscription/usage?days=30')
      .then((response) => {
        if (active) setData(response)
      })
      .catch(() => {
        // Агрегаты уже переданы сервером, поэтому не заменяем их ошибкой.
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [userId])

  const used = safeBigInt(data.usedBytes)
  const limit = data.limitBytes ? safeBigInt(data.limitBytes) : null
  const lifetime = safeBigInt(data.lifetimeBytes)
  const seriesTotal = sumSeries(data.series)
  const hasUsage = used > 0n || lifetime > 0n || seriesTotal > 0n
  const canShowHistory = hasUsage && data.historyAvailable && data.series.length > 1 && seriesTotal > 0n

  return (
    <div className="relative overflow-hidden rounded-lg border border-slate-200 bg-white/95 p-4 text-slate-950 shadow-[0_18px_45px_rgba(15,23,42,0.08)] backdrop-blur dark:border-slate-200 dark:bg-white/95 dark:text-slate-950 sm:p-5">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-cyan-300 via-sky-300 to-emerald-300" />
      <div className="pointer-events-none absolute -right-16 -top-20 h-44 w-44 rounded-full bg-cyan-100/60 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 left-1/3 h-48 w-48 rounded-full bg-emerald-100/60 blur-3xl" />

      <div className="relative flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-xs font-medium uppercase text-cyan-700">
              <Radio className={`h-3.5 w-3.5 ${loading ? 'animate-pulse' : ''}`} />
              Трафик сейчас
            </div>
            <div className="mt-1 text-2xl font-semibold sm:text-3xl">{formatBytes(used)}</div>
            <div className="mt-1 text-xs text-slate-500">
              {limit ? `из ${formatBytes(limit)}` : 'без ограничения'}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 text-right">
            <TrafficMetric
              label="За 30 дней"
              value={canShowHistory ? formatBytes(seriesTotal) : '—'}
            />
            <TrafficMetric
              label="За всё время"
              value={formatBytes(lifetime)}
            />
          </div>
        </div>

        {canShowHistory ? (
          <TrafficPulsePanel series={data.series} />
        ) : (
          <TrafficHistoryEmpty loading={loading} hasUsage={hasUsage} />
        )}

        <div className="text-xs text-slate-500">
          {!hasUsage && !loading
            ? 'После первого подключения здесь появится статистика'
            : canShowHistory
            ? 'Пульс активности за последние 30 дней'
            : data.warning
              ? 'История трафика обновится автоматически'
              : 'История трафика пока пуста'}
        </div>
      </div>
    </div>
  )
}

function TrafficPulsePanel({ series }: { series: SeriesPoint[] }) {
  const pulse = useMemo(() => makeTrafficPulse(series), [series])

  return (
    <div className="grid gap-3 lg:grid-cols-[1fr_220px]">
      <div className="rounded-lg border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-cyan-50/30 p-3 shadow-inner">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Активность по дням</div>
            <div className="mt-0.5 text-sm font-semibold text-slate-900">{pulse.activeDays} активных дней из {series.length}</div>
          </div>
          <div className="rounded-full border border-cyan-100 bg-cyan-50 px-3 py-1 text-xs font-medium text-cyan-700">
            пик {formatBytes(pulse.peak.bytes)}
          </div>
        </div>

        <div className="relative rounded-lg border border-slate-200/80 bg-white/80 px-3 pb-7 pt-4">
          <div className="pointer-events-none absolute left-3 right-3 top-1/2 border-t border-dashed border-slate-200" />
          <div className="pointer-events-none absolute bottom-7 left-3 right-3 border-t border-slate-200" />

          <div className="grid h-28 grid-cols-[repeat(30,minmax(0,1fr))] items-end gap-1.5 sm:gap-2">
            {pulse.days.map((day) => (
              <div key={day.date} className="group relative flex h-full min-w-0 items-end justify-center">
                <div
                  className={`w-full max-w-[18px] rounded-t-md rounded-b-sm bg-gradient-to-t transition-all duration-300 group-hover:-translate-y-0.5 ${
                    day.isPeak
                      ? 'from-emerald-500 via-teal-400 to-cyan-300 shadow-[0_0_18px_rgba(20,184,166,0.32)]'
                      : 'from-sky-600 via-cyan-400 to-cyan-200 shadow-[0_8px_18px_rgba(14,165,233,0.16)]'
                  }`}
                  style={{
                    height: `${day.visualHeight}%`,
                    opacity: day.bytes > 0n ? 1 : 0.2,
                  }}
                  title={`${formatChartDate(day.date)}: ${formatBytes(day.bytes)}`}
                />
                {day.showLabel && (
                  <span className="absolute top-[calc(100%+0.35rem)] text-[10px] text-slate-400">
                    {formatDayNumber(day.date)}
                  </span>
                )}
                <span className="sr-only">{formatChartDate(day.date)}: {formatBytes(day.bytes)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-1">
        <TrafficSideStat icon={<Zap className="h-4 w-4" />} label="Пик" value={formatBytes(pulse.peak.bytes)} hint={formatChartDate(pulse.peak.date)} />
        <TrafficSideStat icon={<TrendingUp className="h-4 w-4" />} label="В среднем" value={formatBytes(pulse.average)} hint="за активный день" />
        <TrafficSideStat icon={<CalendarDays className="h-4 w-4" />} label="Активность" value={`${pulse.activeDays} дн.`} hint="за период" />
      </div>
    </div>
  )
}

function TrafficHistoryEmpty({ loading, hasUsage }: { loading: boolean; hasUsage: boolean }) {
  return (
    <div className="flex h-36 items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50/70 sm:h-44">
      <div className="text-center">
        <span className="mx-auto flex h-9 w-9 items-center justify-center rounded-lg bg-white text-sky-500 shadow-sm">
          <Activity className={`h-5 w-5 ${loading ? 'animate-pulse' : ''}`} />
        </span>
        <div className="mt-3 text-sm font-medium text-slate-700">
          {loading ? 'Загружаем статистику' : hasUsage ? 'История трафика пока не получена' : 'Трафик пока не использовался'}
        </div>
        <div className="mt-1 text-xs text-slate-500">
          {hasUsage ? 'Данные появятся здесь автоматически' : 'График появится после начала использования VPN'}
        </div>
      </div>
    </div>
  )
}

function TrafficMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-24 rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2 shadow-sm">
      <div className="text-[10px] uppercase text-slate-500">{label}</div>
      <div className="mt-0.5 truncate text-xs font-semibold text-slate-800 sm:text-sm">{value}</div>
    </div>
  )
}

function TrafficSideStat({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode
  label: string
  value: string
  hint: string
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
      <div className="flex items-center gap-2 text-xs font-medium uppercase text-slate-500">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-cyan-50 text-cyan-700">{icon}</span>
        {label}
      </div>
      <div className="mt-2 text-lg font-semibold text-slate-950">{value}</div>
      <div className="text-xs text-slate-500">{hint}</div>
    </div>
  )
}

function makeTrafficPulse(series: SeriesPoint[]) {
  const days = series.map((point) => ({
    date: point.date,
    bytes: safeBigInt(point.bytes),
  }))
  const max = days.reduce((current, day) => day.bytes > current ? day.bytes : current, 0n)
  const peak = days.reduce((current, day) => day.bytes > current.bytes ? day : current, days[0])
  const activeDays = days.filter((day) => day.bytes > 0n).length
  const total = days.reduce((sum, day) => sum + day.bytes, 0n)
  const average = activeDays > 0 ? total / BigInt(activeDays) : 0n
  const labelStep = Math.max(1, Math.ceil(days.length / 6))

  return {
    peak,
    activeDays,
    average,
    days: days.map((day, index) => ({
      ...day,
      visualHeight: max > 0n && day.bytes > 0n
        ? Math.min(100, Math.max(10, Number((day.bytes * 100n) / max)))
        : 4,
      isPeak: day.date === peak.date && day.bytes > 0n,
      showLabel: index === 0 || index === days.length - 1 || index % labelStep === 0,
    })),
  }
}

function sumSeries(series: SeriesPoint[]) {
  return series.reduce((total, point) => total + safeBigInt(point.bytes), 0n)
}

function safeBigInt(value: string | undefined) {
  return value && /^\d+$/.test(value) ? BigInt(value) : 0n
}

function formatChartDate(value: string | undefined) {
  if (!value) return ''
  const date = new Date(`${value}T00:00:00Z`)
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: 'short' }).format(date)
}

function formatDayNumber(value: string | undefined) {
  if (!value) return ''
  const date = new Date(`${value}T00:00:00Z`)
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat('ru-RU', { day: '2-digit' }).format(date)
}
