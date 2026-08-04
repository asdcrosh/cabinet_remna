'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Activity,
  AlertTriangle,
  Check,
  CircleDot,
  Clock3,
  Gauge,
  Loader2,
  MemoryStick,
  Radio,
  RefreshCw,
  Server,
  ShieldCheck,
  UsersRound,
  WifiOff,
} from 'lucide-react'
import { cn } from '@/lib/cn'
import type { WatchReport } from '@/lib/watch-service'

type NodeView = WatchReport['nodes'][number]
type ProbeStatus = NodeView['xhttpStatus']
type HealthStatus = NodeView['status']

const healthView: Record<HealthStatus, { label: string; dot: string; text: string; ring: string }> = {
  HEALTHY: { label: 'В норме', dot: 'bg-emerald-500', text: 'text-emerald-700 dark:text-emerald-300', ring: 'border-emerald-200 dark:border-emerald-500/25' },
  DEGRADED: { label: 'Деградация', dot: 'bg-amber-400', text: 'text-amber-700 dark:text-amber-300', ring: 'border-amber-200 dark:border-amber-500/25' },
  DOWN: { label: 'Недоступна', dot: 'bg-red-500', text: 'text-red-700 dark:text-red-300', ring: 'border-red-200 dark:border-red-500/25' },
  DISABLED: { label: 'Отключена', dot: 'bg-slate-400', text: 'text-slate-500 dark:text-slate-400', ring: 'border-slate-200 dark:border-white/10' },
  UNKNOWN: { label: 'Нет данных', dot: 'bg-slate-300', text: 'text-slate-500 dark:text-slate-400', ring: 'border-slate-200 dark:border-white/10' },
}

export function WatchDashboard({ initialReport }: { initialReport: WatchReport }) {
  const [report, setReport] = useState(initialReport)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async (manual = false) => {
    if (manual) setLoading(true)
    setError(null)
    try {
      const response = await fetch('/api/admin/watch', { method: manual ? 'POST' : 'GET', cache: 'no-store' })
      const data = await response.json().catch(() => null)
      if (!response.ok || !data?.summary) throw new Error(data?.error || 'Не удалось обновить Watch')
      setReport(data as WatchReport)
    } catch (refreshError) {
      if (manual) setError(refreshError instanceof Error ? refreshError.message : 'Неизвестная ошибка')
    } finally {
      if (manual) setLoading(false)
    }
  }, [])

  useEffect(() => {
    const timer = window.setInterval(() => void refresh(false), 30_000)
    return () => window.clearInterval(timer)
  }, [refresh])

  const networkLabel = useMemo(() => {
    if (!report.config.enabled) return 'Наблюдение выключено'
    if (report.summary.down > 0) return 'Сеть требует внимания'
    if (report.summary.degraded > 0) return 'Есть деградация'
    if (!report.summary.total) return 'Ожидаем первую проверку'
    return 'Сеть работает штатно'
  }, [report])

  return (
    <div className="space-y-5" aria-live="polite">
      <section className="relative overflow-hidden rounded-3xl border border-slate-200 bg-slate-950 p-5 text-white shadow-sm dark:border-cyan-400/15 sm:p-6">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_12%,rgba(34,211,238,0.16),transparent_34%),radial-gradient(circle_at_88%_80%,rgba(16,185,129,0.12),transparent_30%)]" />
        <div className="relative flex flex-col gap-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-cyan-300">
                <Radio className="h-4 w-4" /> Live network
              </div>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">{networkLabel}</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
                Node API, self-steal XHTTP и TCP Reality проверяются каждые {report.config.intervalSeconds} сек. Один случайный сбой не создаёт инцидент и не отправляет сообщение.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void refresh(true)}
              disabled={loading}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white/10 px-4 text-sm font-semibold text-white transition hover:border-cyan-300/40 hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 disabled:opacity-60"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" /> : <RefreshCw className="h-4 w-4" />}
              Проверить сейчас
            </button>
          </div>

          <NetworkRail nodes={report.nodes} />

          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-white/10 pt-4 text-xs text-slate-300">
            <span className="inline-flex items-center gap-2" suppressHydrationWarning><Clock3 className="h-3.5 w-3.5" /> Последний цикл: {formatRelative(report.runtime?.lastRunAt)}</span>
            <span className="inline-flex items-center gap-2"><UsersRound className="h-3.5 w-3.5" /> {report.summary.usersOnline} онлайн</span>
            <span className="inline-flex items-center gap-2"><ShieldCheck className="h-3.5 w-3.5" /> Telegram {report.config.telegramConfigured ? 'подключён' : 'не настроен'}</span>
            <span className="inline-flex items-center gap-2"><Activity className="h-3.5 w-3.5" /> {report.config.probeAttempts} попытки, тревога после {report.config.failureThreshold} сбоев</span>
            <span className="inline-flex items-center gap-2"><Check className="h-3.5 w-3.5" /> восстановление после {report.config.recoveryThreshold} стабильных циклов</span>
          </div>
        </div>
      </section>

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/25 dark:bg-red-500/10 dark:text-red-200" role="alert">{error}</div>
      ) : null}

      <SummaryStrip report={report} />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.65fr)_minmax(320px,0.75fr)]">
        <section className="space-y-3" aria-labelledby="watch-nodes-heading">
          <div className="flex items-end justify-between gap-3 px-1">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Физические ноды</p>
              <h2 id="watch-nodes-heading" className="mt-1 text-xl font-semibold tracking-tight">Каналы и нагрузка</h2>
            </div>
            <span className="text-xs text-slate-500">Edge check, не VLESS-auth</span>
          </div>
          {report.nodes.length ? (
            <div className="grid gap-3 lg:grid-cols-2">
              {report.nodes.map((node) => <NodeCard key={node.nodeUuid} node={node} />)}
            </div>
          ) : (
            <EmptyState onCheck={() => void refresh(true)} loading={loading} />
          )}
        </section>

        <IncidentTimeline incidents={report.incidents} />
      </div>
    </div>
  )
}

function NetworkRail({ nodes }: { nodes: NodeView[] }) {
  return (
    <div className="overflow-x-auto pb-2 [scrollbar-width:thin]">
      <div className="relative flex min-w-max gap-3 py-1 before:absolute before:left-7 before:right-7 before:top-[31px] before:h-px before:bg-gradient-to-r before:from-cyan-400/10 before:via-cyan-300/45 before:to-cyan-400/10">
        {nodes.length ? nodes.map((node) => {
          const view = healthView[node.status]
          return (
            <article key={node.nodeUuid} className="relative z-10 w-[146px] rounded-2xl border border-white/10 bg-slate-900/85 p-3 backdrop-blur">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-semibold">{countryFlag(node.countryCode)} {node.name}</span>
                <span className={cn('h-2.5 w-2.5 shrink-0 rounded-full ring-4 ring-slate-900', view.dot, node.status === 'HEALTHY' && 'animate-pulse motion-reduce:animate-none')} />
              </div>
              <div className="mt-4 grid grid-cols-2 gap-1.5 text-[10px] font-semibold uppercase tracking-wider">
                <RailProbe label="XHTTP" status={node.xhttpStatus} />
                <RailProbe label="TCP" status={node.tcpStatus} />
              </div>
            </article>
          )
        }) : (
          <div className="relative z-10 rounded-2xl border border-dashed border-white/15 bg-slate-900/80 px-5 py-4 text-sm text-slate-300">Линия появится после первого цикла Watch</div>
        )}
      </div>
    </div>
  )
}

function RailProbe({ label, status }: { label: string; status: ProbeStatus }) {
  return <span className={cn('rounded-lg px-2 py-1.5 text-center', status === 'OK' && 'bg-emerald-400/15 text-emerald-300', status === 'FAIL' && 'bg-red-400/15 text-red-300', status === 'SKIPPED' && 'bg-white/5 text-slate-500')}>{label}</span>
}

function SummaryStrip({ report }: { report: WatchReport }) {
  const items = [
    { label: 'В норме', value: report.summary.healthy, icon: Check, tone: 'text-emerald-600 dark:text-emerald-300' },
    { label: 'Деградация', value: report.summary.degraded, icon: AlertTriangle, tone: 'text-amber-600 dark:text-amber-300' },
    { label: 'Недоступны', value: report.summary.down, icon: WifiOff, tone: 'text-red-600 dark:text-red-300' },
    { label: 'Инциденты', value: report.summary.openIncidents, icon: CircleDot, tone: 'text-cyan-600 dark:text-cyan-300' },
  ]
  return (
    <section className="grid grid-cols-2 overflow-hidden rounded-3xl border border-slate-200 bg-white dark:border-white/10 dark:bg-white/[0.035] lg:grid-cols-4">
      {items.map((item, index) => (
        <div key={item.label} className={cn('flex items-center gap-3 p-4 sm:p-5', index % 2 !== 0 && 'border-l border-slate-200 dark:border-white/10', index >= 2 && 'border-t border-slate-200 dark:border-white/10 lg:border-t-0', index === 2 && 'lg:border-l')}>
          <div className={cn('grid h-10 w-10 place-items-center rounded-2xl bg-slate-100 dark:bg-white/5', item.tone)}><item.icon className="h-5 w-5" /></div>
          <div><div className="text-2xl font-semibold tabular-nums">{item.value}</div><div className="text-xs text-slate-500">{item.label}</div></div>
        </div>
      ))}
    </section>
  )
}

function NodeCard({ node }: { node: NodeView }) {
  const view = healthView[node.status]
  const memoryPercent = node.memoryUsedBytes != null && node.memoryTotalBytes ? Math.min(100, Math.round(node.memoryUsedBytes / node.memoryTotalBytes * 100)) : null
  return (
    <article className={cn('rounded-3xl border bg-white p-4 transition-shadow hover:shadow-md dark:bg-white/[0.035] sm:p-5', view.ring)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0"><div className="flex items-center gap-2"><span className="text-xl" aria-hidden="true">{countryFlag(node.countryCode)}</span><h3 className="truncate text-lg font-semibold">{node.name}</h3></div><p className="mt-1 truncate text-xs text-slate-500">{node.address}</p></div>
        <span className={cn('inline-flex shrink-0 items-center gap-1.5 rounded-full bg-slate-50 px-2.5 py-1 text-xs font-semibold dark:bg-white/5', view.text)}><span className={cn('h-2 w-2 rounded-full', view.dot)} /> {view.label}</span>
      </div>

      <div className="mt-4 space-y-2">
        <TransportRow label="Node API" status={node.apiStatus} detail={node.isConnected ? 'connected' : 'нет связи'} />
        <TransportRow label="XHTTP Reality" status={node.xhttpStatus} detail={formatLatency(node.xhttpLatencyMs)} />
        <TransportRow label="TCP Reality" status={node.tcpStatus} detail={formatLatency(node.tcpLatencyMs)} />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 border-t border-slate-100 pt-4 text-xs dark:border-white/[0.07]">
        <Metric icon={UsersRound} label="Онлайн" value={String(node.usersOnline)} />
        <Metric icon={Gauge} label="Load 1m" value={node.loadOne?.toFixed(2) ?? '—'} />
        <Metric icon={MemoryStick} label="Память" value={memoryPercent == null ? '—' : `${memoryPercent}%`} />
        <Metric icon={Activity} label="Трафик" value={`${formatRate(node.rxBytesPerSecond)} / ${formatRate(node.txBytesPerSecond)}`} />
      </div>

      <div className="mt-4 flex items-end justify-between gap-3">
        <Sparkline points={node.latencySeries} status={node.status} />
        <div className="shrink-0 text-right text-[10px] leading-4 text-slate-400"><div>Xray {node.xrayVersion || '—'}</div><div>Node {node.nodeVersion || '—'}</div></div>
      </div>
      {node.lastError ? <p className="mt-3 line-clamp-2 rounded-xl bg-red-50 px-3 py-2 text-xs leading-5 text-red-700 dark:bg-red-500/10 dark:text-red-200">{node.lastError}</p> : null}
    </article>
  )
}

function TransportRow({ label, status, detail }: { label: string; status: ProbeStatus; detail: string }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-slate-50 px-3 py-2.5 dark:bg-white/[0.04]">
      <span className={cn('h-2.5 w-2.5 shrink-0 rounded-full', status === 'OK' && 'bg-emerald-500', status === 'FAIL' && 'bg-red-500', status === 'SKIPPED' && 'bg-slate-300 dark:bg-slate-600')} />
      <span className="min-w-0 flex-1 truncate text-sm font-medium">{label}</span>
      <span className="text-xs tabular-nums text-slate-500">{status === 'SKIPPED' ? 'не настроен' : detail}</span>
    </div>
  )
}

function Metric({ icon: Icon, label, value }: { icon: typeof Server; label: string; value: string }) {
  return <div className="flex min-w-0 items-center gap-2 rounded-xl border border-slate-100 px-2.5 py-2 dark:border-white/[0.06]"><Icon className="h-3.5 w-3.5 shrink-0 text-slate-400" /><div className="min-w-0"><div className="truncate text-[10px] uppercase tracking-wider text-slate-400">{label}</div><div className="truncate font-medium tabular-nums">{value}</div></div></div>
}

function Sparkline({ points, status }: { points: NodeView['latencySeries']; status: HealthStatus }) {
  const values = points.map((point) => point.latencyMs).filter((value): value is number => value != null)
  if (values.length < 2) return <div className="h-10 text-[10px] text-slate-400">История накапливается</div>
  const width = 150
  const height = 40
  const max = Math.max(...values, 1)
  const coordinates = values.map((value, index) => `${index / (values.length - 1) * width},${height - value / max * (height - 5)}`).join(' ')
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-10 w-[150px] overflow-visible" role="img" aria-label="История задержки">
      <polyline points={coordinates} fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={cn(status === 'DOWN' ? 'stroke-red-500' : status === 'DEGRADED' ? 'stroke-amber-400' : 'stroke-cyan-500')} />
    </svg>
  )
}

function IncidentTimeline({ incidents }: { incidents: WatchReport['incidents'] }) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-white/[0.035] sm:p-5" aria-labelledby="watch-incidents-heading">
      <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Журнал</p><h2 id="watch-incidents-heading" className="mt-1 text-xl font-semibold tracking-tight">Инциденты</h2></div><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600 dark:bg-white/5 dark:text-slate-300">последние 30</span></div>
      <div className="mt-5 space-y-0">
        {incidents.length ? incidents.map((incident, index) => (
          <article key={incident.id} className="relative grid grid-cols-[20px_minmax(0,1fr)] gap-3 pb-5 last:pb-0">
            {index < incidents.length - 1 ? <span className="absolute bottom-0 left-[9px] top-4 w-px bg-slate-200 dark:bg-white/10" /> : null}
            <span className={cn('relative z-10 mt-1 h-5 w-5 rounded-full border-4 border-white dark:border-[#1b1e26]', incident.status === 'OPEN' ? 'bg-red-500' : 'bg-emerald-500')} />
            <div className="min-w-0"><div className="flex items-start justify-between gap-2"><h3 className="text-sm font-semibold leading-5">{incident.title}</h3><span className="shrink-0 text-[10px] text-slate-400" suppressHydrationWarning>{formatRelative(incident.openedAt)}</span></div><p className="mt-1 line-clamp-3 text-xs leading-5 text-slate-500 dark:text-slate-400">{incident.message}</p><div className="mt-1.5 flex items-center gap-2 text-[10px] uppercase tracking-wider text-slate-400"><span>{incidentType(incident.type)}</span>{incident.occurrences > 1 ? <span>· {incident.occurrences} раз</span> : null}</div></div>
          </article>
        )) : (
          <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-8 text-center dark:border-white/10"><ShieldCheck className="mx-auto h-7 w-7 text-emerald-500" /><p className="mt-3 text-sm font-medium">Инцидентов пока нет</p><p className="mt-1 text-xs text-slate-500">Watch сохранит здесь открытие и восстановление.</p></div>
        )}
      </div>
    </section>
  )
}

function EmptyState({ onCheck, loading }: { onCheck: () => void; loading: boolean }) {
  return (
    <div className="rounded-3xl border border-dashed border-slate-300 bg-white px-5 py-12 text-center dark:border-white/15 dark:bg-white/[0.025]">
      <Server className="mx-auto h-9 w-9 text-slate-400" />
      <h3 className="mt-4 font-semibold">Данных о нодах ещё нет</h3>
      <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">Запустите первый безопасный цикл. Он только прочитает Panel API и проверит TLS-кромки.</p>
      <button type="button" onClick={onCheck} disabled={loading} className="btn-primary mt-5">{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Проверить</button>
    </div>
  )
}

function formatLatency(value: number | null) {
  return value == null ? 'нет ответа' : `${value} мс`
}

function formatRate(value: number | null) {
  if (value == null) return '—'
  if (value >= 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} МБ/с`
  if (value >= 1024) return `${(value / 1024).toFixed(0)} КБ/с`
  return `${Math.round(value)} Б/с`
}

function formatRelative(value: string | null | undefined) {
  if (!value) return 'ещё не запускался'
  const seconds = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 1000))
  if (seconds < 60) return `${seconds} сек назад`
  if (seconds < 3600) return `${Math.floor(seconds / 60)} мин назад`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} ч назад`
  return new Date(value).toLocaleDateString('ru-RU')
}

function countryFlag(code: string | null) {
  if (!code || !/^[a-z]{2}$/i.test(code)) return '🌐'
  return code.toUpperCase().replace(/./g, (letter) => String.fromCodePoint(127397 + letter.charCodeAt(0)))
}

function incidentType(type: WatchReport['incidents'][number]['type']) {
  if (type === 'PANEL_API') return 'Panel API'
  if (type === 'NODE_API') return 'Node API'
  if (type === 'XHTTP') return 'XHTTP'
  return 'TCP Reality'
}
