'use client'

import { useEffect, useMemo, useState } from 'react'
import { Activity, Infinity, Radio, TriangleAlert } from 'lucide-react'
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
  const percent = limit && limit > 0n
    ? Math.min(100, Math.round((Number(used) / Number(limit)) * 100))
    : null
  const seriesTotal = data.series.reduce((total, point) => total + safeBigInt(point.bytes), 0n)

  return (
    <div className="relative overflow-hidden rounded-lg border border-cyan-300/25 bg-slate-950 p-4 text-white shadow-[0_18px_50px_rgba(8,145,178,0.15)] sm:p-5">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300 to-transparent" />
      <div className="pointer-events-none absolute -right-16 -top-20 h-48 w-48 rounded-full bg-cyan-400/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 left-1/3 h-44 w-44 rounded-full bg-emerald-400/10 blur-3xl" />

      <div className="relative flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-xs font-medium uppercase text-cyan-200/70">
              <Radio className={`h-3.5 w-3.5 ${loading ? 'animate-pulse' : ''}`} />
              Трафик сейчас
            </div>
            <div className="mt-1 text-2xl font-semibold sm:text-3xl">{formatBytes(used)}</div>
            <div className="mt-1 text-xs text-slate-400">
              {limit ? `из ${formatBytes(limit)}` : 'без ограничения'}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 text-right">
            <NeonMetric
              label="За 30 дней"
              value={data.historyAvailable ? formatBytes(seriesTotal) : '—'}
            />
            <NeonMetric
              label="За всё время"
              value={formatBytes(lifetime)}
            />
          </div>
        </div>

        {data.historyAvailable && data.series.length > 1 ? (
          <NeonAreaChart series={data.series} />
        ) : (
          <TrafficBalance used={used} limit={limit} percent={percent} />
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
          <span>
            {data.historyAvailable
              ? 'Динамика использования за последние 30 дней'
              : 'Дневная история пока недоступна, показан текущий баланс'}
          </span>
          {data.warning && (
            <span className="inline-flex items-center gap-1 text-amber-300">
              <TriangleAlert className="h-3.5 w-3.5" />
              Данные истории временно недоступны
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

function NeonAreaChart({ series }: { series: SeriesPoint[] }) {
  const chart = useMemo(() => makeChart(series), [series])

  return (
    <div className="relative h-36 overflow-hidden rounded-lg border border-white/10 bg-white/[0.035] sm:h-44">
      <div className="absolute inset-0 bg-[linear-gradient(rgba(34,211,238,0.07)_1px,transparent_1px),linear-gradient(90deg,rgba(34,211,238,0.06)_1px,transparent_1px)] bg-[size:100%_25%,12.5%_100%]" />
      <svg
        viewBox="0 0 800 220"
        preserveAspectRatio="none"
        className="absolute inset-0 h-full w-full"
        role="img"
        aria-label="График использования трафика за 30 дней"
      >
        <defs>
          <linearGradient id="traffic-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.5" />
            <stop offset="65%" stopColor="#10b981" stopOpacity="0.12" />
            <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="traffic-line" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#22d3ee" />
            <stop offset="55%" stopColor="#67e8f9" />
            <stop offset="100%" stopColor="#34d399" />
          </linearGradient>
          <filter id="traffic-glow" x="-20%" y="-50%" width="140%" height="200%">
            <feGaussianBlur stdDeviation="5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <path d={chart.areaPath} fill="url(#traffic-area)" />
        <path
          d={chart.linePath}
          fill="none"
          stroke="url(#traffic-line)"
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
          filter="url(#traffic-glow)"
        />
        {chart.points.map((point) => (
          <circle key={point.date} cx={point.x} cy={point.y} r="4" fill="#ecfeff" opacity="0.9">
            <title>{`${formatChartDate(point.date)}: ${formatBytes(point.bytes)}`}</title>
          </circle>
        ))}
      </svg>
      <div className="absolute bottom-2 left-3 text-[11px] text-cyan-100/55">{formatChartDate(series[0]?.date)}</div>
      <div className="absolute bottom-2 right-3 text-[11px] text-emerald-100/55">
        {formatChartDate(series[series.length - 1]?.date)}
      </div>
    </div>
  )
}

function TrafficBalance({
  used,
  limit,
  percent,
}: {
  used: bigint
  limit: bigint | null
  percent: number | null
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.035] p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm text-slate-300">Использование периода</div>
        <div className="flex items-center gap-1.5 font-medium text-cyan-200">
          {percent === null ? <Infinity className="h-4 w-4" /> : `${percent}%`}
        </div>
      </div>
      <div className="relative mt-4 h-4 overflow-hidden rounded-full border border-cyan-300/20 bg-slate-900">
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(34,211,238,0.08)_1px,transparent_1px)] bg-[size:12px_100%]" />
        <div
          className="relative h-full rounded-full bg-gradient-to-r from-cyan-400 via-sky-300 to-emerald-400 shadow-[0_0_18px_rgba(34,211,238,0.75)] transition-all duration-700"
          style={{ width: `${percent === null ? (used > 0n ? 100 : 0) : Math.max(percent, used > 0n ? 2 : 0)}%` }}
        />
      </div>
      <div className="mt-2 flex justify-between text-[11px] text-slate-500">
        <span>0 B</span>
        <span>{limit ? formatBytes(limit) : 'Безлимит'}</span>
      </div>
    </div>
  )
}

function NeonMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-24 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2">
      <div className="text-[10px] uppercase text-slate-500">{label}</div>
      <div className="mt-0.5 truncate text-xs font-semibold text-slate-100 sm:text-sm">{value}</div>
    </div>
  )
}

function makeChart(series: SeriesPoint[]) {
  const width = 800
  const height = 220
  const top = 22
  const bottom = 190
  const values = series.map((point) => Number(safeBigInt(point.bytes)))
  const max = Math.max(...values, 1)
  const points = series.map((point, index) => {
    const x = series.length === 1 ? width / 2 : (index / (series.length - 1)) * width
    const value = Number(safeBigInt(point.bytes))
    const y = bottom - (value / max) * (bottom - top)
    return { x, y, date: point.date, bytes: safeBigInt(point.bytes) }
  })
  const linePath = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ')
  const areaPath = `${linePath} L ${points[points.length - 1]?.x ?? width} ${height} L ${points[0]?.x ?? 0} ${height} Z`
  return { points, linePath, areaPath }
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
