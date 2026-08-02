'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertTriangle, Check, Copy, ServerCrash } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import {
  createApiErrorReport,
  createRuntimeErrorReport,
  formatAdminErrorReport,
  publishAdminError,
  subscribeToAdminErrors,
  type AdminErrorReport,
} from '@/lib/admin-error-report'
import { reportClientError } from '@/lib/client-logger'

const DEDUPE_WINDOW_MS = 15_000
const MAX_QUEUE_SIZE = 10

export function AdminErrorCenter() {
  const [queue, setQueue] = useState<AdminErrorReport[]>([])
  const [copied, setCopied] = useState(false)
  const fingerprintsRef = useRef(new Map<string, number>())
  const current = queue[0]

  const enqueue = useCallback((report: AdminErrorReport) => {
    const now = Date.now()
    const fingerprint = [report.source, report.method, report.endpoint, report.status, report.errorCode, report.message].join('|')
    const previous = fingerprintsRef.current.get(fingerprint) ?? 0
    if (now - previous < DEDUPE_WINDOW_MS) return
    fingerprintsRef.current.set(fingerprint, now)
    for (const [key, timestamp] of fingerprintsRef.current) {
      if (now - timestamp > DEDUPE_WINDOW_MS) fingerprintsRef.current.delete(key)
    }
    setQueue((items) => [...items.slice(-(MAX_QUEUE_SIZE - 1)), report])
  }, [])

  useEffect(() => subscribeToAdminErrors(enqueue), [enqueue])

  useEffect(() => {
    const nativeFetch = window.fetch.bind(window)

    async function monitoredFetch(input: RequestInfo | URL, init?: RequestInit) {
      const request = getRequestMeta(input, init)
      try {
        const response = await nativeFetch(input, init)
        if (!response.ok && request.track) {
          const data = await readErrorBody(response.clone())
          enqueue(createApiErrorReport({
            method: request.method,
            endpoint: request.endpoint,
            status: response.status,
            statusText: response.statusText,
            data,
            requestId: response.headers.get('x-request-id'),
          }))
        }
        return response
      } catch (error) {
        if (request.track && !isCanceledRequest(error)) {
          enqueue(createApiErrorReport({
            method: request.method,
            endpoint: request.endpoint,
            networkError: error,
          }))
        }
        throw error
      }
    }

    window.fetch = monitoredFetch
    return () => {
      if (window.fetch === monitoredFetch) window.fetch = nativeFetch
    }
  }, [enqueue])

  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      const error = event.error ?? new Error(event.message || 'Неизвестная ошибка интерфейса')
      reportClientError('ui.admin_runtime_error', error)
      enqueue(createRuntimeErrorReport(error, 'interface'))
    }
    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      if (isCanceledRequest(event.reason)) return
      reportClientError('ui.admin_unhandled_rejection', event.reason)
      enqueue(createRuntimeErrorReport(event.reason, 'promise'))
    }
    window.addEventListener('error', onError)
    window.addEventListener('unhandledrejection', onUnhandledRejection)
    return () => {
      window.removeEventListener('error', onError)
      window.removeEventListener('unhandledrejection', onUnhandledRejection)
    }
  }, [enqueue])

  useEffect(() => setCopied(false), [current?.id])

  async function copyDiagnostics() {
    if (!current) return
    await navigator.clipboard.writeText(formatAdminErrorReport(current))
    setCopied(true)
  }

  function closeCurrent() {
    setQueue((items) => items.slice(1))
  }

  return (
    <Modal
      open={Boolean(current)}
      title={current?.title ?? 'Ошибка'}
      description={current ? `Подробная диагностика · ${formatDate(current.occurredAt)}` : undefined}
      variant="sheet"
      panelClassName="sm:max-w-2xl"
      bodyClassName="space-y-4"
      onClose={closeCurrent}
      footer={current ? (
        <div className="grid gap-2 sm:grid-cols-[auto_1fr_auto] sm:items-center">
          <Button variant="secondary" onClick={() => void copyDiagnostics()}>
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? 'Скопировано' : 'Скопировать диагностику'}
          </Button>
          <div className="text-center text-xs text-slate-500">
            {queue.length > 1 ? `В очереди ещё: ${queue.length - 1}` : 'Изменение могло не примениться'}
          </div>
          <Button onClick={closeCurrent}>{queue.length > 1 ? 'Следующая ошибка' : 'Закрыть'}</Button>
        </div>
      ) : null}
    >
      {current ? <ErrorReport report={current} /> : null}
    </Modal>
  )
}

function ErrorReport({ report }: { report: AdminErrorReport }) {
  return (
    <>
      <section className="rounded-2xl border border-red-200 bg-red-50 p-4 dark:border-red-400/20 dark:bg-red-500/10">
        <div className="flex items-start gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-red-100 text-red-700 dark:bg-red-400/15 dark:text-red-200">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h3 className="font-semibold text-red-950 dark:text-red-100">Что произошло</h3>
            <p className="mt-1 break-words text-sm leading-6 text-red-900 dark:text-red-100/90">{report.message}</p>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 p-4 dark:border-white/10">
        <h3 className="text-sm font-semibold text-slate-950 dark:text-white">Почему это произошло</h3>
        <p className="mt-1.5 text-sm leading-6 text-slate-600 dark:text-slate-300">{report.explanation}</p>
      </section>

      {report.recommendations.length > 0 ? (
        <section className="rounded-2xl border border-slate-200 p-4 dark:border-white/10">
          <h3 className="text-sm font-semibold text-slate-950 dark:text-white">Что проверить</h3>
          <ol className="mt-2 space-y-2 text-sm leading-5 text-slate-600 dark:text-slate-300">
            {report.recommendations.map((item, index) => (
              <li key={item} className="grid grid-cols-[1.5rem_1fr] gap-2">
                <span className="grid h-6 w-6 place-items-center rounded-lg bg-slate-100 text-xs font-semibold text-slate-700 dark:bg-white/10 dark:text-slate-200">{index + 1}</span>
                <span className="pt-0.5">{item}</span>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      <section className="overflow-hidden rounded-2xl border border-slate-200 dark:border-white/10">
        <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3 dark:border-white/10">
          <ServerCrash className="h-4 w-4 text-slate-500" />
          <h3 className="text-sm font-semibold text-slate-950 dark:text-white">Данные для диагностики</h3>
        </div>
        <dl className="grid grid-cols-[8rem_minmax(0,1fr)] gap-x-3 gap-y-2 px-4 py-3 text-sm">
          {report.method || report.endpoint ? <DiagnosticRow label="Операция" value={[report.method, report.endpoint].filter(Boolean).join(' ')} /> : null}
          {report.status ? <DiagnosticRow label="HTTP" value={`${report.status}${report.statusText ? ` ${report.statusText}` : ''}`} /> : null}
          {report.requestId ? <DiagnosticRow label="ID запроса" value={report.requestId} mono /> : null}
          {report.errorCode ? <DiagnosticRow label="Код ошибки" value={report.errorCode} mono /> : null}
          <DiagnosticRow label="Источник" value={sourceLabel(report.source)} />
        </dl>
        {report.technicalDetails !== undefined ? (
          <div className="border-t border-slate-200 p-4 dark:border-white/10">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Ответ сервера</div>
            <pre className="max-h-52 overflow-auto whitespace-pre-wrap break-words rounded-xl bg-slate-950 p-3 text-xs leading-5 text-slate-200">
              {JSON.stringify(report.technicalDetails, null, 2)}
            </pre>
          </div>
        ) : null}
      </section>
    </>
  )
}

function DiagnosticRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <>
      <dt className="text-slate-500">{label}</dt>
      <dd className={`min-w-0 break-all text-slate-900 dark:text-slate-100 ${mono ? 'font-mono text-xs' : ''}`}>{value}</dd>
    </>
  )
}

function getRequestMeta(input: RequestInfo | URL, init?: RequestInit) {
  const request = input instanceof Request ? input : null
  const rawUrl = request?.url ?? String(input)
  let endpoint = rawUrl
  let track = false
  try {
    const url = new URL(rawUrl, window.location.origin)
    endpoint = url.pathname
    track = url.origin === window.location.origin && url.pathname.startsWith('/api/')
  } catch {
    track = rawUrl.startsWith('/api/')
  }

  const headers = new Headers(request?.headers)
  new Headers(init?.headers).forEach((value, key) => headers.set(key, value))
  if (headers.get('x-error-presentation') === 'silent') track = false

  return {
    endpoint,
    method: (init?.method ?? request?.method ?? 'GET').toUpperCase(),
    track,
  }
}

async function readErrorBody(response: Response) {
  const contentType = response.headers.get('content-type') ?? ''
  if (contentType.includes('json')) return response.json().catch(() => null)
  const text = await response.text().catch(() => '')
  return text ? { error: text.slice(0, 8_000) } : null
}

function isCanceledRequest(error: unknown) {
  return error instanceof Error && error.name === 'AbortError'
}

function formatDate(value: string) {
  return new Date(value).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'medium' })
}

function sourceLabel(source: AdminErrorReport['source']) {
  if (source === 'api') return 'API Cabinet'
  if (source === 'promise') return 'Фоновая операция интерфейса'
  if (source === 'manual') return 'Проверка формы'
  return 'Интерфейс администратора'
}

export function showAdminRuntimeError(error: unknown, context?: string) {
  publishAdminError(createRuntimeErrorReport(error, 'interface', context))
}
