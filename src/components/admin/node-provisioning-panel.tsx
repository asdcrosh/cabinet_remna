'use client'

import { FormEvent, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  CircleDot,
  Clock3,
  Globe2,
  KeyRound,
  Loader2,
  RefreshCw,
  Rocket,
  Search,
  Server,
  ShieldCheck,
  Terminal,
  XCircle,
} from 'lucide-react'
import { cn } from '@/lib/cn'
import { toast } from '@/components/ui/toaster'
import { Checkbox } from '@/components/ui/checkbox'

const POLL_INTERVAL_MS = 4_000
const MAX_VISIBLE_JOBS = 8

const fallbackSteps = [
  { key: 'QUEUED', label: 'В очереди' },
  { key: 'DNS', label: 'DNS в Timeweb' },
  { key: 'SSH_PREFLIGHT', label: 'Подключение к серверу' },
  { key: 'REMNAWAVE_NODE', label: 'Нода в Remnawave' },
  { key: 'ANSIBLE', label: 'Установка Ansible' },
  { key: 'NODE_CONNECT', label: 'Подключение ноды' },
  { key: 'HOSTS', label: 'Хосты TCP и XHTTP' },
  { key: 'VERIFY', label: 'Финальная проверка' },
  { key: 'DONE', label: 'Готово' },
] as const

type JobStatus = 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED' | 'CANCELED'
type StepStatus = 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'SKIPPED'

type ProvisioningStep = {
  key: string
  label?: string | null
  status: StepStatus
  message?: string | null
  startedAt?: string | null
  finishedAt?: string | null
  events?: Array<{
    id: string
    level: 'INFO' | 'WARNING' | 'ERROR' | string
    message: string
    createdAt: string
  }>
}

type ProvisioningJob = {
  id: string
  nodeName: string
  serverIp: string
  sshPort?: number | null
  sshUser?: string | null
  domain?: string | null
  status: JobStatus
  currentStep?: string | null
  lastError?: string | null
  createdAt: string
  updatedAt: string
  steps?: ProvisioningStep[]
}

type ProvisioningResponse = {
  jobs?: ProvisioningJob[]
  tasks?: ProvisioningJob[]
  job?: ProvisioningJob
  error?: string
  requestId?: string
  templates?: ProvisioningTemplates
  templatesError?: string | null
  configuration?: { ready: boolean; missing: string[] }
  inspection?: HostKeyInspection
}

type HostKeyInspection = {
  serverIp: string
  sshPort: number
  expectedFingerprint: string
  currentFingerprint: string
  changed: boolean
}

type ProvisioningTemplates = {
  tcpTemplateHostUuid?: string | null
  xhttpTemplateHostUuid?: string | null
  hosts?: Array<{
    uuid: string
    remark: string
    address: string
    port: number
    kind: 'TCP' | 'XHTTP' | 'OTHER' | string
    isDisabled?: boolean
    isHidden?: boolean
  }>
}

type ProvisioningTemplateHost = NonNullable<ProvisioningTemplates['hosts']>[number]

type FormState = {
  nodeName: string
  serverIp: string
  sshPort: string
  sshUser: string
  sshPassword: string
  tcpTemplateHostUuid: string
  xhttpTemplateHostUuid: string
}

const initialForm: FormState = {
  nodeName: '',
  serverIp: '',
  sshPort: '22',
  sshUser: 'root',
  sshPassword: '',
  tcpTemplateHostUuid: '',
  xhttpTemplateHostUuid: '',
}

export function NodeProvisioningPanel() {
  const [form, setForm] = useState<FormState>(initialForm)
  const [jobs, setJobs] = useState<ProvisioningJob[]>([])
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null)
  const [loadingJobs, setLoadingJobs] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [retryingJobId, setRetryingJobId] = useState<string | null>(null)
  const [listError, setListError] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [retryError, setRetryError] = useState<{ jobId: string; message: string } | null>(null)
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null)
  const [templates, setTemplates] = useState<ProvisioningTemplates | null>(null)
  const [configuration, setConfiguration] = useState<{ ready: boolean; missing: string[] } | null>(null)
  const [templatesError, setTemplatesError] = useState<string | null>(null)
  const refreshInFlight = useRef(false)

  const refreshJobs = useCallback(async (visible = false) => {
    if (refreshInFlight.current) return
    refreshInFlight.current = true
    if (visible) setLoadingJobs(true)

    try {
      const response = await fetch('/api/admin/nodes/provisioning', {
        method: 'GET',
        cache: 'no-store',
        headers: { 'x-error-presentation': 'silent' },
      })
      const data = await response.json().catch(() => null) as ProvisioningResponse | null
      if (!response.ok) throw new Error(formatApiError(data, 'Не удалось получить последние задачи'))

      const nextJobs = normalizeJobs(data)
      setJobs(nextJobs)
      if (data?.templates) {
        setTemplates(data.templates)
        setForm((current) => ({
          ...current,
          tcpTemplateHostUuid: current.tcpTemplateHostUuid || data.templates?.tcpTemplateHostUuid || '',
          xhttpTemplateHostUuid: current.xhttpTemplateHostUuid || data.templates?.xhttpTemplateHostUuid || '',
        }))
      }
      if (data?.configuration) setConfiguration(data.configuration)
      setTemplatesError(data?.templatesError || null)
      setListError(null)
      setLastUpdatedAt(new Date().toISOString())
      setSelectedJobId((current) => {
        if (current && nextJobs.some((job) => job.id === current)) return current
        return nextJobs.find((job) => isActive(job.status))?.id ?? nextJobs[0]?.id ?? null
      })
    } catch (error) {
      setListError(error instanceof Error ? error.message : 'Не удалось получить последние задачи')
    } finally {
      refreshInFlight.current = false
      setLoadingJobs(false)
    }
  }, [])

  useEffect(() => {
    void refreshJobs(true)
  }, [refreshJobs])

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refreshJobs(false)
    }, POLL_INTERVAL_MS)
    return () => window.clearInterval(timer)
  }, [refreshJobs])

  const selectedJob = useMemo(
    () => jobs.find((job) => job.id === selectedJobId) ?? jobs[0] ?? null,
    [jobs, selectedJobId]
  )
  const activeJobs = jobs.filter((job) => isActive(job.status)).length
  const failedJobs = jobs.filter((job) => job.status === 'FAILED').length
  const completedJobs = jobs.filter((job) => job.status === 'SUCCEEDED').length

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting) return
    if (!form.tcpTemplateHostUuid || !form.xhttpTemplateHostUuid) {
      setSubmitError('Выберите TCP- и XHTTP-шаблоны из списка')
      return
    }

    setSubmitting(true)
    setSubmitError(null)
    try {
      const response = await fetch('/api/admin/nodes/provisioning', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nodeName: form.nodeName.trim(),
          serverIp: form.serverIp.trim(),
          sshPort: Number(form.sshPort),
          sshUser: form.sshUser.trim(),
          sshPassword: form.sshPassword,
          tcpTemplateHostUuid: form.tcpTemplateHostUuid.trim(),
          xhttpTemplateHostUuid: form.xhttpTemplateHostUuid.trim(),
        }),
      })
      const data = await response.json().catch(() => null) as ProvisioningResponse | null
      if (!response.ok) throw new Error(formatApiError(data, 'Не удалось запустить создание ноды'))

      if (data?.job) {
        setJobs((current) => [data.job!, ...current.filter((job) => job.id !== data.job!.id)])
        setSelectedJobId(data.job.id)
      }
      setForm((current) => ({ ...current, nodeName: '', serverIp: '', sshPassword: '' }))
      toast('Создание ноды запущено', 'success')
      await refreshJobs(false)
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Не удалось запустить создание ноды')
    } finally {
      setSubmitting(false)
    }
  }

  async function retryJob(job: ProvisioningJob) {
    if (job.status !== 'FAILED' || retryingJobId) return

    setRetryingJobId(job.id)
    setRetryError(null)
    try {
      const response = await fetch(`/api/admin/nodes/provisioning/${encodeURIComponent(job.id)}`, {
        method: 'POST',
        headers: { 'x-error-presentation': 'silent' },
      })
      const data = await response.json().catch(() => null) as ProvisioningResponse | null
      if (!response.ok) throw new Error(formatApiError(data, 'Не удалось повторно запустить задачу'))
      if (!data?.job) throw new Error('Сервер не вернул обновлённое состояние задачи')

      setJobs((current) => current.some((item) => item.id === data.job!.id)
        ? current.map((item) => item.id === data.job!.id ? data.job! : item)
        : [data.job!, ...current])
      setSelectedJobId(data.job.id)
      toast('Повторный запуск поставлен в очередь', 'success')
      await refreshJobs(false)
    } catch (error) {
      setRetryError({
        jobId: job.id,
        message: error instanceof Error ? error.message : 'Не удалось повторно запустить задачу',
      })
    } finally {
      setRetryingJobId(null)
    }
  }

  async function trustHostKey(job: ProvisioningJob, fingerprint: string) {
    if (job.status !== 'FAILED' || retryingJobId) return
    setRetryingJobId(job.id)
    setRetryError(null)
    try {
      const response = await fetch(`/api/admin/nodes/provisioning/${encodeURIComponent(job.id)}/ssh-host-key`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'x-error-presentation': 'silent' },
        body: JSON.stringify({ fingerprint }),
      })
      const data = await response.json().catch(() => null) as ProvisioningResponse | null
      if (!response.ok) throw new Error(formatApiError(data, 'Не удалось подтвердить новый SSH-ключ'))
      if (!data?.job) throw new Error('Сервер не вернул обновлённое состояние задачи')
      setJobs((current) => current.map((item) => item.id === data.job!.id ? data.job! : item))
      toast('Новый SSH-ключ подтверждён, установка продолжена', 'success')
      await refreshJobs(false)
    } catch (error) {
      setRetryError({ jobId: job.id, message: error instanceof Error ? error.message : 'Не удалось подтвердить новый SSH-ключ' })
    } finally {
      setRetryingJobId(null)
    }
  }

  return (
    <div className="space-y-5">
      <section className="relative overflow-hidden rounded-3xl border border-slate-800 bg-slate-950 text-white shadow-sm dark:border-cyan-400/15">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_10%,rgba(34,211,238,0.14),transparent_34%),radial-gradient(circle_at_92%_90%,rgba(99,102,241,0.12),transparent_30%)]" />
        <div className="relative grid gap-5 p-5 sm:p-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">
              <Terminal className="h-4 w-4" /> Provisioning console
            </div>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">Новая нода — от IP до готовых хостов</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
              Кабинет создаст домен, настроит сервер, подключит Remnawave и проверит TCP/XHTTP. Пароль шифруется и удаляется после успеха или через 24 часа.
            </p>
          </div>
          <div className="grid grid-cols-3 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.06]">
            <HeroMetric label="В работе" value={activeJobs} tone="text-cyan-300" />
            <HeroMetric label="Готово" value={completedJobs} tone="text-emerald-300" border />
            <HeroMetric label="Ошибки" value={failedJobs} tone="text-red-300" border />
          </div>
        </div>
      </section>

      <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(320px,0.82fr)_minmax(0,1.18fr)]">
        <form onSubmit={submit} className="min-w-0 overflow-hidden rounded-3xl border border-slate-200 bg-white dark:border-white/10 dark:bg-white/[0.03]">
          <div className="border-b border-slate-200 p-4 dark:border-white/[0.07] sm:p-5">
            <div className="flex items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-cyan-50 text-cyan-700 dark:bg-cyan-400/10 dark:text-cyan-200">
                <Rocket className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-lg font-semibold">Параметры новой ноды</h2>
                <p className="mt-1 text-sm leading-5 text-slate-500">Все поля проверяются до первого изменения на сервере.</p>
              </div>
            </div>
          </div>

          <div className="space-y-5 p-4 sm:p-5">
            <fieldset className="space-y-3">
              <legend className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-950 dark:text-white">
                <Server className="h-4 w-4 text-slate-400" /> Сервер
              </legend>
              <Field label="Имя ноды" hint="Будет частью домена">
                <input
                  name="provisioningNodeName"
                  className="input"
                  value={form.nodeName}
                  onChange={(event) => updateForm('nodeName', event.target.value)}
                  placeholder="nl-ams-03"
                  autoComplete="off"
                  pattern="[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?"
                  title="Латинские строчные буквы, цифры и дефисы; без дефиса в начале и конце"
                  maxLength={32}
                  required
                />
              </Field>
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_8rem]">
                <Field label="IP-адрес">
                  <input
                    name="serverIp"
                    className="input font-mono"
                    value={form.serverIp}
                    onChange={(event) => updateForm('serverIp', event.target.value)}
                    placeholder="203.0.113.10"
                    inputMode="decimal"
                    autoComplete="off"
                    required
                  />
                </Field>
                <Field label="SSH-порт">
                  <input
                    name="sshPort"
                    className="input font-mono"
                    type="number"
                    min={1}
                    max={65535}
                    value={form.sshPort}
                    onChange={(event) => updateForm('sshPort', event.target.value)}
                    required
                  />
                </Field>
              </div>
              <Field label="SSH-пользователь">
                <input
                  name="sshUser"
                  className="input"
                  value={form.sshUser}
                  onChange={(event) => updateForm('sshUser', event.target.value)}
                  placeholder="root"
                  autoComplete="username"
                  pattern="[A-Za-z_][A-Za-z0-9_-]{0,31}"
                  maxLength={32}
                  required
                />
              </Field>
              <Field label="SSH-пароль" hint="Не отображается в журнале">
                <div className="relative">
                  <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    name="sshPassword"
                    className="input pl-9"
                    type="password"
                    value={form.sshPassword}
                    onChange={(event) => updateForm('sshPassword', event.target.value)}
                    placeholder="Пароль сервера"
                    autoComplete="new-password"
                    minLength={8}
                    maxLength={512}
                    required
                  />
                </div>
              </Field>
            </fieldset>

            <fieldset className="space-y-3 border-t border-slate-200 pt-5 dark:border-white/[0.07]">
              <legend className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-950 dark:text-white">
                <Globe2 className="h-4 w-4 text-slate-400" /> Шаблоны хостов
              </legend>
              <TemplateHostPicker
                kind="TCP"
                hosts={templates?.hosts ?? []}
                value={form.tcpTemplateHostUuid}
                onChange={(uuid) => updateForm('tcpTemplateHostUuid', uuid)}
              />
              <TemplateHostPicker
                kind="XHTTP"
                hosts={templates?.hosts ?? []}
                value={form.xhttpTemplateHostUuid}
                onChange={(uuid) => updateForm('xhttpTemplateHostUuid', uuid)}
              />
            </fieldset>

            {submitError ? (
              <div className="flex items-start gap-2 rounded-2xl border border-red-200 bg-red-50 px-3.5 py-3 text-sm leading-5 text-red-800 dark:border-red-500/25 dark:bg-red-500/10 dark:text-red-100" role="alert">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{submitError}</span>
              </div>
            ) : null}

            {configuration && !configuration.ready ? (
              <div className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-sm leading-5 text-amber-900 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-100" role="status">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>На сервере не заполнены: {configuration.missing.join(', ')}</span>
              </div>
            ) : null}

            {templatesError ? (
              <div className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-sm leading-5 text-amber-900 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-100" role="status">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>Список шаблонов недоступен. Проверьте подключение к Remnawave и обновите страницу. {templatesError}</span>
              </div>
            ) : null}

            <button
              type="submit"
              className="btn-primary min-h-12 w-full justify-center"
              disabled={submitting || configuration?.ready === false || !form.tcpTemplateHostUuid || !form.xhttpTemplateHostUuid}
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" /> : <Rocket className="h-4 w-4" />}
              {submitting ? 'Запускаем создание...' : 'Создать и настроить ноду'}
            </button>
            <p className="flex items-start gap-2 text-xs leading-5 text-slate-500">
              <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
              Повторное нажатие заблокировано до ответа сервера. Ход установки появится справа.
            </p>
          </div>
        </form>

        <section className="min-w-0 overflow-hidden rounded-3xl border border-slate-200 bg-white dark:border-white/10 dark:bg-white/[0.03]" aria-live="polite">
          <div className="flex flex-col gap-3 border-b border-slate-200 p-4 dark:border-white/[0.07] sm:flex-row sm:items-center sm:justify-between sm:p-5">
            <div>
              <div className="flex items-center gap-2">
                <CircleDot className={cn('h-4 w-4', selectedJob && isActive(selectedJob.status) ? 'animate-pulse text-cyan-500 motion-reduce:animate-none' : 'text-slate-400')} />
                <h2 className="text-lg font-semibold">Ход развёртывания</h2>
              </div>
              <p className="mt-1 text-sm text-slate-500">
                {lastUpdatedAt ? `Обновлено ${formatTime(lastUpdatedAt)}` : 'Получаем состояние очереди'}
              </p>
            </div>
            <button type="button" className="btn-secondary min-h-10 px-3" onClick={() => void refreshJobs(true)} disabled={loadingJobs}>
              <RefreshCw className={cn('h-4 w-4', loadingJobs && 'animate-spin motion-reduce:animate-none')} />
              Обновить
            </button>
          </div>

          <div className="p-4 sm:p-5">
            {loadingJobs && jobs.length === 0 ? <ProvisioningSkeleton /> : null}
            {!loadingJobs && listError && jobs.length === 0 ? (
              <QueueUnavailable error={listError} onRetry={() => void refreshJobs(true)} />
            ) : null}
            {!loadingJobs && !listError && jobs.length === 0 ? <EmptyQueue /> : null}
            {selectedJob ? (
              <JobProgress
                job={selectedJob}
                retrying={retryingJobId === selectedJob.id}
                retryError={retryError?.jobId === selectedJob.id ? retryError.message : null}
                onRetry={() => void retryJob(selectedJob)}
                onTrustHostKey={(fingerprint) => void trustHostKey(selectedJob, fingerprint)}
              />
            ) : null}
          </div>
        </section>
      </div>

      {jobs.length > 0 ? (
        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white dark:border-white/10 dark:bg-white/[0.03]">
          <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-4 dark:border-white/[0.07] sm:px-5">
            <div>
              <h2 className="font-semibold">Последние задачи</h2>
              <p className="mt-0.5 text-xs text-slate-500">Выберите задачу, чтобы открыть её этапы и ошибку.</p>
            </div>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600 dark:bg-white/[0.06] dark:text-slate-300">{jobs.length}</span>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-white/[0.07]">
            {jobs.slice(0, MAX_VISIBLE_JOBS).map((job) => (
              <button
                key={job.id}
                type="button"
                onClick={() => setSelectedJobId(job.id)}
                aria-pressed={selectedJob?.id === job.id}
                className={cn(
                  'grid w-full min-w-0 gap-3 px-4 py-3.5 text-left transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-cyan-500 dark:hover:bg-white/[0.035] sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center sm:px-5',
                  selectedJob?.id === job.id && 'bg-cyan-50/70 dark:bg-cyan-400/[0.06]'
                )}
              >
                <div className="min-w-0">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="truncate font-semibold">{job.nodeName}</span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                    {job.domain ? <span className="font-mono text-slate-600 dark:text-slate-300">{job.domain}</span> : null}
                    <span>SSH: <span className="font-mono">{job.serverIp}{job.sshPort ? `:${job.sshPort}` : ''}</span></span>
                    <span>{formatDate(job.createdAt)}</span>
                  </div>
                </div>
                <JobStatusBadge status={job.status} />
                <ChevronRight className="hidden h-4 w-4 text-slate-400 sm:block" />
              </button>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  )

  function updateForm<Key extends keyof FormState>(key: Key, value: FormState[Key]) {
    setForm((current) => ({ ...current, [key]: value }))
  }
}

function JobProgress({
  job,
  retrying,
  retryError,
  onRetry,
  onTrustHostKey,
}: {
  job: ProvisioningJob
  retrying: boolean
  retryError: string | null
  onRetry: () => void
  onTrustHostKey: (fingerprint: string) => void
}) {
  const steps = resolveSteps(job)

  return (
    <div>
      <div className="flex flex-col gap-3 rounded-2xl bg-slate-50 p-4 dark:bg-white/[0.035] sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <h3 className="truncate text-lg font-semibold">{job.nodeName}</h3>
            <JobStatusBadge status={job.status} />
          </div>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
            {job.domain ? <span className="font-mono text-slate-600 dark:text-slate-300">{job.domain}</span> : null}
            <span>SSH: <span className="font-mono">{job.serverIp}{job.sshPort ? `:${job.sshPort}` : ''}</span></span>
            {job.sshUser ? <span>Пользователь: {job.sshUser}</span> : null}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5 text-xs text-slate-400">
          <Clock3 className="h-3.5 w-3.5" /> {formatDate(job.updatedAt)}
        </div>
      </div>

      <ol className="mt-5" aria-label="Этапы создания ноды">
        {steps.map((step, index) => {
          const view = stepView(step.status)
          const Icon = view.icon
          const latestEvent = step.events?.at(-1)
          const message = step.message || latestEvent?.message
          return (
            <li key={`${step.key}:${index}`} className="relative grid grid-cols-[2rem_minmax(0,1fr)] gap-3 pb-4 last:pb-0">
              {index < steps.length - 1 ? (
                <span className={cn('absolute bottom-0 left-[15px] top-8 w-px', step.status === 'SUCCEEDED' ? 'bg-emerald-300 dark:bg-emerald-500/40' : 'bg-slate-200 dark:bg-white/10')} />
              ) : null}
              <span className={cn('relative z-10 grid h-8 w-8 place-items-center rounded-xl border', view.box)}>
                <Icon className={cn('h-4 w-4', step.status === 'RUNNING' && 'animate-spin motion-reduce:animate-none')} />
              </span>
              <div className="min-w-0 pt-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-semibold">{step.label || stepLabel(step.key)}</span>
                  <span className={cn('text-[10px] font-semibold uppercase tracking-wider', view.text)}>{view.label}</span>
                </div>
                {message ? (
                  <p className={cn('mt-1 break-words text-xs leading-5', step.status === 'FAILED' || latestEvent?.level === 'ERROR' ? 'text-red-700 dark:text-red-200' : 'text-slate-500 dark:text-slate-400')}>{message}</p>
                ) : null}
              </div>
            </li>
          )
        })}
      </ol>

      {job.lastError || job.status === 'FAILED' ? (
        <div className="mt-5 overflow-hidden rounded-2xl border border-red-200 bg-red-50 dark:border-red-500/25 dark:bg-red-500/10">
          <div className="flex items-center gap-2 border-b border-red-200 px-3.5 py-2.5 text-sm font-semibold text-red-900 dark:border-red-500/20 dark:text-red-100">
            <Terminal className="h-4 w-4" /> Ошибка выполнения
          </div>
          {job.lastError ? (
            <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-words px-3.5 py-3 font-mono text-xs leading-5 text-red-800 dark:text-red-100">{job.lastError}</pre>
          ) : null}
          {job.status === 'FAILED' ? (
            <div className="border-t border-red-200 px-3.5 py-3 dark:border-red-500/20">
              {retryError ? (
                <div className="mb-3 flex items-start gap-2 text-sm leading-5 text-red-800 dark:text-red-100" role="alert">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{retryError}</span>
                </div>
              ) : null}
              {job.lastError?.includes('SSH host key изменился после предыдущего запуска') ? (
                <SshHostKeyRecovery job={job} retrying={retrying} onRetry={onRetry} onTrust={onTrustHostKey} />
              ) : (
                <button type="button" className="btn-secondary min-h-10" onClick={onRetry} disabled={retrying}>
                  {retrying ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" /> : <RefreshCw className="h-4 w-4" />}
                  {retrying ? 'Возвращаем в очередь...' : 'Повторить установку'}
                </button>
              )}
              <p className="mt-2 text-xs leading-5 text-red-700/80 dark:text-red-200/80">
                Существующие объекты будут использованы повторно, а удалённые из Remnawave — созданы заново.
              </p>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function SshHostKeyRecovery({
  job,
  retrying,
  onRetry,
  onTrust,
}: {
  job: ProvisioningJob
  retrying: boolean
  onRetry: () => void
  onTrust: (fingerprint: string) => void
}) {
  const [inspection, setInspection] = useState<HostKeyInspection | null>(null)
  const [checking, setChecking] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function inspect() {
    setChecking(true)
    setError(null)
    try {
      const response = await fetch(`/api/admin/nodes/provisioning/${encodeURIComponent(job.id)}/ssh-host-key`, {
        headers: { 'x-error-presentation': 'silent' },
        cache: 'no-store',
      })
      const data = await response.json().catch(() => null) as ProvisioningResponse | null
      if (!response.ok) throw new Error(formatApiError(data, 'Не удалось проверить SSH-ключ'))
      if (!data?.inspection) throw new Error('Сервер не вернул SSH fingerprint')
      setInspection(data.inspection)
      setConfirmed(false)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось проверить SSH-ключ')
    } finally {
      setChecking(false)
    }
  }

  if (!inspection) {
    return (
      <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-amber-950 dark:border-amber-400/25 dark:bg-amber-400/10 dark:text-amber-100">
        <div className="flex items-start gap-2"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" /><p className="text-sm leading-5">После переустановки сервера новый ключ нужно проверить и подтвердить.</p></div>
        {error ? <p className="mt-2 text-xs text-red-700 dark:text-red-200">{error}</p> : null}
        <button type="button" className="btn-secondary mt-3 min-h-10" onClick={() => void inspect()} disabled={checking}>
          {checking ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
          {checking ? 'Проверяем...' : 'Проверить новый SSH-ключ'}
        </button>
      </div>
    )
  }

  if (!inspection.changed) {
    return <button type="button" className="btn-secondary min-h-10" onClick={onRetry} disabled={retrying}><RefreshCw className="h-4 w-4" /> Повторить установку</button>
  }

  return (
    <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-amber-950 dark:border-amber-400/25 dark:bg-amber-400/10 dark:text-amber-100">
      <p className="text-sm font-semibold">Сверьте fingerprint на переустановленном сервере</p>
      <code className="mt-2 block overflow-x-auto rounded-lg bg-slate-950 px-3 py-2 font-mono text-xs text-cyan-200">ssh-keygen -E sha256 -lf /etc/ssh/ssh_host_ed25519_key.pub</code>
      <div className="mt-3 space-y-1 text-xs">
        <p>Старый: <span className="break-all font-mono">{inspection.expectedFingerprint}</span></p>
        <p>Новый: <span className="break-all font-mono font-semibold">{inspection.currentFingerprint}</span></p>
      </div>
      <Checkbox className="mt-3" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} label="Fingerprint на сервере совпадает с новым ключом" />
      <button type="button" className="btn-primary mt-3 min-h-10" disabled={!confirmed || retrying} onClick={() => onTrust(inspection.currentFingerprint)}>
        {retrying ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
        {retrying ? 'Продолжаем установку...' : 'Подтвердить ключ и продолжить'}
      </button>
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block min-w-0">
      <span className="mb-1.5 flex items-center justify-between gap-2 text-sm font-medium">
        {label}
        {hint ? <span className="text-right text-xs font-normal text-slate-400">{hint}</span> : null}
      </span>
      {children}
    </label>
  )
}

function TemplateHostPicker({
  kind,
  hosts,
  value,
  onChange,
}: {
  kind: 'TCP' | 'XHTTP'
  hosts: ProvisioningTemplateHost[]
  value: string
  onChange: (uuid: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const panelId = useId()
  const availableHosts = useMemo(
    () => hosts.filter((host) => host.kind === kind),
    [hosts, kind]
  )
  const selectedHost = hosts.find((host) => host.uuid === value)
  const filteredHosts = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('ru-RU')
    if (!normalizedQuery) return availableHosts
    return availableHosts.filter((host) => [
      host.remark,
      host.address,
      String(host.port),
      host.uuid,
    ].some((field) => field.toLocaleLowerCase('ru-RU').includes(normalizedQuery)))
  }, [availableHosts, query])

  useEffect(() => {
    if (!open) return
    searchRef.current?.focus()

    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      setOpen(false)
      triggerRef.current?.focus()
    }

    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div ref={rootRef} className="min-w-0">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="text-sm font-medium">{kind}-шаблон</span>
        <span className="text-xs text-slate-400">{availableHosts.length} в списке</span>
      </div>
      <button
        ref={triggerRef}
        type="button"
        className={cn(
          'flex min-h-14 w-full items-center gap-3 rounded-xl border bg-white px-3 py-2.5 text-left transition-colors dark:bg-white/[0.025]',
          open
            ? 'border-cyan-500 ring-2 ring-cyan-500/15'
            : 'border-slate-200 hover:border-slate-300 dark:border-white/10 dark:hover:border-white/20'
        )}
        aria-label={`Выбрать ${kind}-шаблон`}
        aria-expanded={open}
        aria-controls={panelId}
        aria-haspopup="listbox"
        onClick={() => {
          setOpen((current) => !current)
          setQuery('')
        }}
      >
        <span className={cn(
          'grid h-8 min-w-12 shrink-0 place-items-center rounded-lg px-2 font-mono text-xs font-semibold',
          kind === 'TCP'
            ? 'bg-cyan-50 text-cyan-700 dark:bg-cyan-400/10 dark:text-cyan-200'
            : 'bg-violet-50 text-violet-700 dark:bg-violet-400/10 dark:text-violet-200'
        )}>
          {kind}
        </span>
        <span className="min-w-0 flex-1">
          <span className={cn('block truncate text-sm font-semibold', !selectedHost && !value && 'text-slate-500')}>
            {selectedHost?.remark || (value ? 'Шаблон из настроек' : `Выберите ${kind}-host`)}
          </span>
          <span className="mt-0.5 block truncate font-mono text-xs text-slate-500">
            {selectedHost ? `${selectedHost.address}:${selectedHost.port}` : value || 'Поиск по имени или адресу'}
          </span>
        </span>
        <ChevronDown className={cn('h-4 w-4 shrink-0 text-slate-400 transition-transform', open && 'rotate-180')} />
      </button>

      {open ? (
        <div id={panelId} className="mt-2 overflow-hidden rounded-2xl border border-slate-200 bg-slate-50/80 shadow-sm dark:border-white/10 dark:bg-slate-950/40">
          <div className="border-b border-slate-200 p-2.5 dark:border-white/10">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                ref={searchRef}
                type="search"
                className="input min-h-10 bg-white pl-9 text-sm dark:bg-white/[0.04]"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Имя, домен, порт или UUID"
                aria-label={`Поиск ${kind}-шаблона`}
                autoComplete="off"
              />
            </div>
          </div>
          <div className="max-h-64 overflow-y-auto p-1.5" role="listbox" aria-label={`${kind}-шаблоны`}>
            {filteredHosts.length ? filteredHosts.map((host) => {
              const selected = host.uuid === value
              return (
                <button
                  key={host.uuid}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  className={cn(
                    'flex w-full items-start gap-2.5 rounded-xl px-3 py-2.5 text-left transition-colors',
                    selected
                      ? 'bg-cyan-50 text-cyan-950 dark:bg-cyan-400/10 dark:text-cyan-50'
                      : 'hover:bg-white dark:hover:bg-white/[0.05]'
                  )}
                  onClick={() => {
                    onChange(host.uuid)
                    setOpen(false)
                    setQuery('')
                    triggerRef.current?.focus()
                  }}
                >
                  <span className={cn(
                    'mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border',
                    selected
                      ? 'border-cyan-500 bg-cyan-500 text-white'
                      : 'border-slate-300 text-transparent dark:border-slate-600'
                  )}>
                    <Check className="h-3 w-3" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span className="break-words text-sm font-semibold">{host.remark}</span>
                      {host.isDisabled ? (
                        <span className="rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800 dark:bg-amber-400/10 dark:text-amber-200">
                          отключён
                        </span>
                      ) : null}
                      {host.isHidden ? (
                        <span className="rounded-md bg-slate-200 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-700 dark:bg-white/10 dark:text-slate-300">
                          скрыт
                        </span>
                      ) : null}
                    </span>
                    <span className="mt-0.5 block break-all font-mono text-xs text-slate-500">
                      {host.address}:{host.port}
                    </span>
                  </span>
                </button>
              )
            }) : (
              <div className="px-3 py-6 text-center text-sm text-slate-500">
                {availableHosts.length ? 'По этому запросу ничего не найдено' : `${kind}-шаблоны не найдены в Remnawave`}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}

function HeroMetric({ label, value, tone, border = false }: { label: string; value: number; tone: string; border?: boolean }) {
  return (
    <div className={cn('min-w-[5.25rem] px-3 py-3 text-center sm:px-4', border && 'border-l border-white/10')}>
      <div className={cn('text-xl font-semibold tabular-nums', tone)}>{value}</div>
      <div className="mt-0.5 whitespace-nowrap text-[10px] uppercase tracking-wider text-slate-400">{label}</div>
    </div>
  )
}

function JobStatusBadge({ status }: { status: JobStatus }) {
  const view = jobStatusView(status)
  return (
    <span className={cn('inline-flex w-fit shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold', view.className)}>
      <span className={cn('h-2 w-2 rounded-full', view.dot, isActive(status) && 'animate-pulse motion-reduce:animate-none')} />
      {view.label}
    </span>
  )
}

function ProvisioningSkeleton() {
  return (
    <div className="space-y-4" role="status" aria-label="Загрузка задач">
      <div className="skeleton h-20 rounded-2xl" />
      {[0, 1, 2, 3, 4].map((item) => (
        <div key={item} className="flex items-center gap-3">
          <div className="skeleton h-8 w-8 shrink-0 rounded-xl" />
          <div className="min-w-0 flex-1 space-y-2"><div className="skeleton h-3.5 w-40 max-w-full" /><div className="skeleton h-3 w-64 max-w-[85%]" /></div>
        </div>
      ))}
    </div>
  )
}

function QueueUnavailable({ error, onRetry }: { error: string; onRetry: () => void }) {
  return (
    <div className="grid min-h-80 place-items-center rounded-2xl border border-dashed border-red-200 bg-red-50/60 p-6 text-center dark:border-red-500/25 dark:bg-red-500/[0.06]">
      <div className="max-w-md">
        <XCircle className="mx-auto h-9 w-9 text-red-500" />
        <h3 className="mt-3 font-semibold text-red-950 dark:text-red-100">Очередь недоступна</h3>
        <p className="mt-1 text-sm leading-6 text-red-800 dark:text-red-200">{error}</p>
        <button type="button" className="btn-secondary mt-4" onClick={onRetry}><RefreshCw className="h-4 w-4" /> Повторить</button>
      </div>
    </div>
  )
}

function EmptyQueue() {
  return (
    <div className="grid min-h-80 place-items-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 p-6 text-center dark:border-white/10 dark:bg-white/[0.02]">
      <div className="max-w-sm">
        <Server className="mx-auto h-10 w-10 text-slate-300 dark:text-slate-600" />
        <h3 className="mt-3 font-semibold">Задач пока нет</h3>
        <p className="mt-1 text-sm leading-6 text-slate-500">Заполните параметры сервера. После запуска здесь появятся этапы и результат проверки.</p>
      </div>
    </div>
  )
}

function normalizeJobs(data: ProvisioningResponse | null) {
  const jobs = data?.jobs ?? data?.tasks ?? (data?.job ? [data.job] : [])
  return [...jobs].sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))
}

function resolveSteps(job: ProvisioningJob): ProvisioningStep[] {
  if (job.steps?.length) return job.steps

  const currentIndex = fallbackSteps.findIndex((step) => step.key === job.currentStep)
  return fallbackSteps.map((step, index) => {
    let status: StepStatus = 'PENDING'
    if (job.status === 'SUCCEEDED') status = 'SUCCEEDED'
    else if (currentIndex >= 0 && index < currentIndex) status = 'SUCCEEDED'
    else if (currentIndex >= 0 && index === currentIndex) status = job.status === 'FAILED' ? 'FAILED' : 'RUNNING'
    else if (job.status === 'FAILED' && currentIndex < 0 && index === 0) status = 'FAILED'
    return { ...step, status }
  })
}

function jobStatusView(status: JobStatus) {
  if (status === 'SUCCEEDED') return { label: 'Готово', className: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-200', dot: 'bg-emerald-500' }
  if (status === 'FAILED') return { label: 'Ошибка', className: 'bg-red-50 text-red-700 dark:bg-red-400/10 dark:text-red-200', dot: 'bg-red-500' }
  if (status === 'RUNNING') return { label: 'Выполняется', className: 'bg-cyan-50 text-cyan-700 dark:bg-cyan-400/10 dark:text-cyan-200', dot: 'bg-cyan-500' }
  if (status === 'CANCELLED' || status === 'CANCELED') return { label: 'Отменено', className: 'bg-slate-100 text-slate-600 dark:bg-white/[0.06] dark:text-slate-300', dot: 'bg-slate-400' }
  return { label: 'В очереди', className: 'bg-amber-50 text-amber-700 dark:bg-amber-400/10 dark:text-amber-200', dot: 'bg-amber-400' }
}

function stepView(status: StepStatus) {
  if (status === 'SUCCEEDED') return { label: 'Готово', icon: CheckCircle2, box: 'border-emerald-200 bg-emerald-50 text-emerald-600 dark:border-emerald-500/25 dark:bg-emerald-400/10 dark:text-emerald-300', text: 'text-emerald-600 dark:text-emerald-300' }
  if (status === 'FAILED') return { label: 'Ошибка', icon: XCircle, box: 'border-red-200 bg-red-50 text-red-600 dark:border-red-500/25 dark:bg-red-400/10 dark:text-red-300', text: 'text-red-600 dark:text-red-300' }
  if (status === 'RUNNING') return { label: 'Выполняется', icon: Loader2, box: 'border-cyan-200 bg-cyan-50 text-cyan-600 dark:border-cyan-500/25 dark:bg-cyan-400/10 dark:text-cyan-300', text: 'text-cyan-600 dark:text-cyan-300' }
  if (status === 'SKIPPED') return { label: 'Пропущено', icon: Circle, box: 'border-slate-200 bg-slate-50 text-slate-400 dark:border-white/10 dark:bg-white/[0.03]', text: 'text-slate-400' }
  return { label: 'Ожидает', icon: Circle, box: 'border-slate-200 bg-white text-slate-300 dark:border-white/10 dark:bg-white/[0.02] dark:text-slate-600', text: 'text-slate-400' }
}

function stepLabel(key: string) {
  return fallbackSteps.find((step) => step.key === key)?.label ?? key.replaceAll('_', ' ').toLocaleLowerCase('ru-RU')
}

function isActive(status: JobStatus) {
  return status === 'PENDING' || status === 'RUNNING'
}

function formatApiError(data: ProvisioningResponse | null, fallback: string) {
  const message = data?.error?.trim() || fallback
  return data?.requestId ? `${message} Код: ${data.requestId.slice(0, 8)}` : message
}

function formatDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'время неизвестно'
  return date.toLocaleString('ru-RU', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function formatTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'только что'
  return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}
