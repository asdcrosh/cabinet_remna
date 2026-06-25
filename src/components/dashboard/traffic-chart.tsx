'use client'

import { useEffect, useMemo, useState } from 'react'
import { Activity, Radio } from 'lucide-react'
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
  const seriesTotal = data.series.reduce((total, point) => total + safeBigInt(point.bytes), 0n)

  return (
    <div className="relative overflow-hidden rounded-lg border border-cyan-200/80 bg-white/90 p-4 text-slate-950 shadow-[0_18px_45px_rgba(14,165,233,0.10)] backdrop-blur dark:border-cyan-200/80 dark:bg-white/90 dark:text-slate-950 sm:p-5">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-cyan-300 via-sky-400 to-emerald-300" />

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
          <TrafficHistoryChart series={data.series} />
        ) : (
          <TrafficHistoryEmpty loading={loading} />
        )}

        <div className="text-xs text-slate-500">
          {data.historyAvailable
            ? 'Использование трафика по дням за последние 30 дней'
            : data.warning
              ? 'История трафика обновится автоматически'
              : 'История трафика пока пуста'}
        </div>
      </div>
    </div>
  )
}

function TrafficHistoryChart({ series }: { series: SeriesPoint[] }) {
  const chart = useMemo(() => makeChart(series), [series])
  const labels = useMemo(() => makeDateLabels(series), [series])

  return (
    <div className="relative h-48 overflow-hidden rounded-lg border border-slate-200 bg-white sm:h-56">
      <svg
        viewBox="0 0 900 260"
        preserveAspectRatio="none"
        className="absolute inset-0 h-full w-full"
        role="img"
        aria-label="График использования трафика за 30 дней"
      >
        <defs>
          <linearGradient id="traffic-line" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#06b6d4" />
            <stop offset="52%" stopColor="#0ea5e9" />
            <stop offset="100%" stopColor="#10b981" />
          </linearGradient>
          <linearGradient id="traffic-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.16" />
            <stop offset="80%" stopColor="#38bdf8" stopOpacity="0.015" />
            <stop offset="100%" stopColor="#38bdf8" stopOpacity="0" />
          </linearGradient>
          <filter id="traffic-glow" x="-20%" y="-50%" width="140%" height="200%">
            <feGaussianBlur stdDeviation="2.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        {chart.yTicks.map((tick) => (
          <g key={tick.y}>
            <line
              x1={chart.left}
              x2={chart.right}
              y1={tick.y}
              y2={tick.y}
              stroke="#e2e8f0"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
            <text
              x="12"
              y={tick.y + 4}
              fill="#94a3b8"
              fontSize="11"
              fontFamily="sans-serif"
            >
              {formatBytes(tick.value)}
            </text>
          </g>
        ))}
        <path d={chart.areaPath} fill="url(#traffic-area)" />
        <path
          d={chart.linePath}
          fill="none"
          stroke="url(#traffic-line)"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
        {chart.points.map((point, index) => (
          <circle
            key={point.date}
            cx={point.x}
            cy={point.y}
            r={index % 5 === 0 || index === chart.points.length - 1 ? 2.75 : 1.5}
            fill="#ffffff"
            stroke="#0ea5e9"
            strokeWidth="1.25"
            opacity={index % 5 === 0 || index === chart.points.length - 1 ? 1 : 0.38}
          >
            <title>{`${formatChartDate(point.date)}: ${formatBytes(point.bytes)}`}</title>
          </circle>
        ))}
        <g className="traffic-chart-moving-dot">
          <circle r="9" fill="#0ea5e9" opacity="0.14">
            <animate attributeName="r" values="7;11;7" dur="1.8s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.2;0.04;0.2" dur="1.8s" repeatCount="indefinite" />
          </circle>
          <circle r="4.5" fill="#ffffff" stroke="#0284c7" strokeWidth="2.5" filter="url(#traffic-glow)" />
          <animateMotion
            path={chart.linePath}
            dur="8s"
            repeatCount="indefinite"
          />
        </g>
      </svg>
      <div className="absolute bottom-2 left-[7%] right-3 flex justify-between text-[10px] text-slate-500">
        {labels.map((label) => (
          <span key={label.date}>{formatChartDate(label.date)}</span>
        ))}
      </div>
    </div>
  )
}

function TrafficHistoryEmpty({ loading }: { loading: boolean }) {
  return (
    <div className="flex h-36 items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50/70 sm:h-44">
      <div className="text-center">
        <span className="mx-auto flex h-9 w-9 items-center justify-center rounded-lg bg-white text-sky-500 shadow-sm">
          <Activity className={`h-5 w-5 ${loading ? 'animate-pulse' : ''}`} />
        </span>
        <div className="mt-3 text-sm font-medium text-slate-700">
          {loading ? 'Загружаем статистику' : 'История трафика пока не получена'}
        </div>
        <div className="mt-1 text-xs text-slate-500">Данные появятся здесь автоматически</div>
      </div>
    </div>
  )
}

function NeonMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-24 rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2 shadow-sm">
      <div className="text-[10px] uppercase text-slate-500">{label}</div>
      <div className="mt-0.5 truncate text-xs font-semibold text-slate-800 sm:text-sm">{value}</div>
    </div>
  )
}

function makeChart(series: SeriesPoint[]) {
  const width = 900
  const height = 260
  const left = 66
  const right = 884
  const top = 22
  const bottom = 214
  const values = series.map((point) => Number(safeBigInt(point.bytes)))
  const max = Math.max(...values, 1)
  const points = series.map((point, index) => {
    const x = series.length === 1
      ? (left + right) / 2
      : left + (index / (series.length - 1)) * (right - left)
    const value = Number(safeBigInt(point.bytes))
    const y = bottom - (value / max) * (bottom - top)
    return { x, y, date: point.date, bytes: safeBigInt(point.bytes) }
  })
  const linePath = makeSmoothPath(points)
  const areaPath = `${linePath} L ${right} ${bottom} L ${left} ${bottom} Z`
  const yTicks = [max, max / 2, 0].map((value) => ({
    value: BigInt(Math.max(0, Math.round(value))),
    y: bottom - (value / max) * (bottom - top),
  }))
  return { width, height, left, right, points, linePath, areaPath, yTicks }
}

function makeSmoothPath(points: Array<{ x: number; y: number }>) {
  if (points.length === 0) return ''
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`

  let path = `M ${points[0].x} ${points[0].y}`
  for (let index = 0; index < points.length - 1; index += 1) {
    const previous = points[index - 1] ?? points[index]
    const current = points[index]
    const next = points[index + 1]
    const afterNext = points[index + 2] ?? next
    const controlOneX = current.x + (next.x - previous.x) / 6
    const controlOneY = current.y + (next.y - previous.y) / 6
    const controlTwoX = next.x - (afterNext.x - current.x) / 6
    const controlTwoY = next.y - (afterNext.y - current.y) / 6

    path += ` C ${controlOneX} ${controlOneY}, ${controlTwoX} ${controlTwoY}, ${next.x} ${next.y}`
  }
  return path
}

function makeDateLabels(series: SeriesPoint[]) {
  if (series.length <= 1) return series
  const desiredLabels = 6
  const indexes = new Set<number>()

  for (let index = 0; index < desiredLabels; index += 1) {
    indexes.add(Math.round((index / (desiredLabels - 1)) * (series.length - 1)))
  }

  return Array.from(indexes)
    .sort((left, right) => left - right)
    .map((index) => series[index])
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
