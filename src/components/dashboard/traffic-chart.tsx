// Клиентский компонент: тянет /api/subscription/usage?days=30,
// рисует простой SVG-бар-чарт (без зависимостей).

'use client'

import { useEffect, useState } from 'react'
import { apiFetch } from '@/lib/api-client'
import { formatBytes } from '@/lib/format'
import { InlineAlert } from './empty-state'

interface Series { date: string; bytes: string }

export function TrafficChart({ userId }: { userId: string }) {
  const [series, setSeries] = useState<Series[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    apiFetch<{ series: Series[] }>('/api/subscription/usage?days=30')
      .then((d) => setSeries(d.series))
      .catch((e) => setError(e.message))
  }, [userId])

  if (error) return <InlineAlert tone="danger" title="Не удалось загрузить график" description={error} />
  if (!series) return <TrafficSkeleton />
  if (series.length === 0) {
    return <p className="rounded-xl border px-4 py-8 text-center text-sm text-slate-400">Нет данных за выбранный период.</p>
  }

  const max = Math.max(...series.map((s) => Number(BigInt(s.bytes || '0'))))
  const total = series.reduce((acc, s) => acc + BigInt(s.bytes || '0'), 0n)

  return (
    <div>
      <div className="text-sm text-slate-500 mb-3">
        Всего за 30 дней: <span className="font-medium text-slate-900 dark:text-slate-100">{formatBytes(total)}</span>
      </div>
      <div className="flex items-end gap-1 h-32">
        {series.map((s, i) => {
          const v = Number(BigInt(s.bytes || '0'))
          const h = max > 0 ? Math.max(2, Math.round((v / max) * 100)) : 0
          return (
            <div
              key={i}
              className="flex-1 rounded-t bg-brand-500/80 hover:bg-brand-600 transition-colors"
              style={{ height: `${h}%` }}
              title={`${s.date}: ${formatBytes(v)}`}
            />
          )
        })}
      </div>
      <div className="flex justify-between text-xs text-slate-400 mt-2">
        <span>{series[0]?.date}</span>
        <span>{series[series.length - 1]?.date}</span>
      </div>
    </div>
  )
}

function TrafficSkeleton() {
  return (
    <div className="space-y-3">
      <div className="h-4 w-48 animate-pulse rounded bg-slate-200 dark:bg-surface-800" />
      <div className="flex h-32 items-end gap-1">
        {Array.from({ length: 24 }).map((_, index) => (
          <div
            key={index}
            className="flex-1 animate-pulse rounded-t bg-slate-200 dark:bg-surface-800"
            style={{ height: `${20 + (index % 8) * 8}%` }}
          />
        ))}
      </div>
    </div>
  )
}
