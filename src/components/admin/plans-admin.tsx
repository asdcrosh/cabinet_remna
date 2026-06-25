'use client'

import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import {
  ChevronDown,
  Edit3,
  Globe2,
  Link2,
  Plus,
  Power,
  RefreshCw,
  Server,
  Trash2,
} from 'lucide-react'
import { apiFetch } from '@/lib/api-client'
import { formatPrice } from '@/lib/format'
import { toast } from '@/components/ui/toaster'
import { cn } from '@/lib/cn'
import { planAvailabilityLabels, type PlanAvailabilityValue } from '@/lib/plan-availability'
import { AdminModal } from '@/components/admin/admin-modal'

export interface PlanAdminRow {
  id: string
  name: string
  description: string | null
  priceKopecks: number
  durationDays: number
  trafficLimitGb: number | null
  deviceLimit: number
  activeInternalSquads: string[]
  availability: PlanAvailabilityValue
  allowedEmails: string[]
  allowedTelegramIds: string[]
  isPromo: boolean
  isActive: boolean
  sortOrder: number
  paymentsCount: number
  subscriptionsCount: number
}

interface PlanFormState {
  name: string
  description: string
  priceRub: string
  durationDays: string
  trafficLimitGb: string
  unlimitedTraffic: boolean
  deviceLimit: string
  activeInternalSquads: string
  availability: PlanAvailabilityValue
  allowedUsers: string
  sortOrder: string
  isPromo: boolean
  isActive: boolean
}

interface RemnawaveSquad {
  uuid: string
  name: string
  isActive: boolean
}

const emptyForm: PlanFormState = {
  name: '',
  description: '',
  priceRub: '300',
  durationDays: '30',
  trafficLimitGb: '200',
  unlimitedTraffic: false,
  deviceLimit: '5',
  activeInternalSquads: '',
  availability: 'ALL',
  allowedUsers: '',
  sortOrder: '10',
  isPromo: false,
  isActive: true,
}

export function PlansAdmin({ plans }: { plans: PlanAdminRow[] }) {
  const router = useRouter()
  const [createOpen, setCreateOpen] = useState(false)
  const [createForm, setCreateForm] = useState<PlanFormState>(emptyForm)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<PlanFormState | null>(null)
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const [squads, setSquads] = useState<RemnawaveSquad[]>([])
  const [squadsLoading, setSquadsLoading] = useState(false)
  const [squadsError, setSquadsError] = useState<string | null>(null)

  useEffect(() => {
    void loadSquads()
  }, [])

  async function loadSquads() {
    setSquadsLoading(true)
    setSquadsError(null)
    try {
      const result = await apiFetch<{ squads: RemnawaveSquad[] }>('/api/admin/remnawave/squads')
      setSquads(result.squads)
    } catch (error) {
      setSquadsError(error instanceof Error ? error.message : 'Не удалось загрузить группы')
    } finally {
      setSquadsLoading(false)
    }
  }

  async function submit(form: PlanFormState, planId?: string) {
    const loadingKey = planId ?? 'create'
    setLoadingId(loadingKey)
    try {
      await apiFetch(planId ? `/api/admin/plans/${planId}` : '/api/admin/plans', {
        method: planId ? 'PATCH' : 'POST',
        body: JSON.stringify(toPayload(form)),
      })
      toast(planId ? 'Тариф обновлён' : 'Тариф создан', 'success')
      if (planId) {
        setEditingId(null)
        setEditForm(null)
      } else {
        setCreateForm(emptyForm)
        setCreateOpen(false)
      }
      router.refresh()
    } finally {
      setLoadingId(null)
    }
  }

  async function toggleActive(plan: PlanAdminRow) {
    setLoadingId(plan.id)
    try {
      await apiFetch(`/api/admin/plans/${plan.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: !plan.isActive }),
      })
      toast(plan.isActive ? 'Тариф скрыт' : 'Тариф опубликован', 'success')
      router.refresh()
    } finally {
      setLoadingId(null)
    }
  }

  async function deletePlan(plan: PlanAdminRow) {
    if (plan.paymentsCount > 0 || plan.subscriptionsCount > 0) {
      toast('Используемый тариф можно только скрыть')
      return
    }
    if (!window.confirm(`Удалить тариф «${plan.name}»?`)) return
    setLoadingId(plan.id)
    try {
      await apiFetch(`/api/admin/plans/${plan.id}`, { method: 'DELETE' })
      toast('Тариф удалён', 'success')
      router.refresh()
    } finally {
      setLoadingId(null)
    }
  }

  async function copyPlanLink(plan: PlanAdminRow) {
    const url = `${window.location.origin}/dashboard/plans?plan=${encodeURIComponent(plan.id)}`
    try {
      await navigator.clipboard.writeText(url)
      toast('Ссылка на тариф скопирована', 'success')
    } catch {
      toast('Не удалось скопировать ссылку')
    }
  }

  function startEdit(plan: PlanAdminRow) {
    setEditingId(plan.id)
    setEditForm(formFromPlan(plan))
  }

  function closeEditor() {
    setCreateOpen(false)
    setEditingId(null)
    setEditForm(null)
  }

  const squadById = useMemo(() => new Map(squads.map((squad) => [squad.uuid, squad])), [squads])

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-surface-900 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-semibold">Каталог тарифов</h2>
          <p className="mt-1 text-sm text-slate-500">{plans.length} тарифов · настройки открываются в отдельном окне</p>
        </div>
        <div className="flex gap-2">
          <button type="button" className="btn-secondary" onClick={() => void loadSquads()} disabled={squadsLoading}>
            <RefreshCw className={cn('h-4 w-4', squadsLoading && 'animate-spin')} />
            Группы
          </button>
          <button type="button" className="btn-primary" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" />
            Новый тариф
          </button>
        </div>
      </div>

      <AdminModal
        open={createOpen}
        title="Новый тариф"
        description="Цена, срок, аудитория и группы Remnawave"
        onClose={closeEditor}
        size="xl"
      >
          <PlanEditor
            form={createForm}
            setForm={setCreateForm}
            squads={squads}
            squadsLoading={squadsLoading}
            squadsError={squadsError}
            submitLabel="Создать тариф"
            loading={loadingId === 'create'}
            onSubmit={() => void submit(createForm)}
          />
      </AdminModal>

      <AdminModal
        open={Boolean(editingId && editForm)}
        title={editForm ? `Редактировать «${editForm.name}»` : 'Редактировать тариф'}
        description="Изменения применятся к карточке тарифа после сохранения"
        onClose={closeEditor}
        size="xl"
      >
        {editingId && editForm && (
          <PlanEditor
            form={editForm}
            setForm={(value) => {
              setEditForm((current) => {
                const base = current ?? editForm
                return typeof value === 'function' ? value(base) : value
              })
            }}
            squads={squads}
            squadsLoading={squadsLoading}
            squadsError={squadsError}
            submitLabel="Сохранить изменения"
            loading={loadingId === editingId}
            onSubmit={() => void submit(editForm, editingId)}
          />
        )}
      </AdminModal>

      {plans.length === 0 && (
        <button type="button" onClick={() => setCreateOpen(true)} className="card w-full py-12 text-center text-sm text-slate-500">
          Тарифов пока нет. Создать первый тариф
        </button>
      )}

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-white/10 dark:bg-surface-900">
        {plans.map((plan) => {
          const selectedSquads = plan.activeInternalSquads.map((id) => squadById.get(id)).filter(Boolean) as RemnawaveSquad[]
          const unknownSquads = plan.activeInternalSquads.filter((id) => !squadById.has(id))
          return (
            <article key={plan.id} className="border-b border-slate-100 p-4 last:border-b-0 dark:border-white/10">
              <div className="grid gap-4 xl:grid-cols-[minmax(15rem,1.2fr)_minmax(12rem,.7fr)_minmax(16rem,1fr)_auto] xl:items-center">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="truncate font-semibold">{plan.name}</h3>
                    <span className={plan.isActive ? 'badge-active' : 'badge-disabled'}>{plan.isActive ? 'Опубликован' : 'Скрыт'}</span>
                    {plan.isPromo && <span className="badge-limited">Пробный</span>}
                  </div>
                  <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className="text-xl font-semibold">{formatPrice(plan.priceKopecks)}</span>
                    <span className="text-xs text-slate-500">{plan.durationDays} дней · {plan.trafficLimitGb == null ? 'безлимит' : `${plan.trafficLimitGb} ГБ`} · {plan.deviceLimit} устройств</span>
                  </div>
                  {plan.description && <p className="mt-1 truncate text-sm text-slate-500">{plan.description}</p>}
                </div>

                <div className="min-w-0">
                  <div className="text-[11px] font-semibold uppercase text-slate-400">Доступ</div>
                  <div className="mt-1 text-sm font-medium">{planAvailabilityLabels[plan.availability]}</div>
                  {plan.availability === 'ALLOWED' && <div className="text-xs text-slate-500">{new Set([...plan.allowedEmails, ...plan.allowedTelegramIds]).size} пользователей</div>}
                </div>

                <div className="min-w-0">
                  <div className="mb-1.5 flex items-center gap-2 text-[11px] font-semibold uppercase text-slate-400">
                    <Server className="h-3.5 w-3.5" />
                    Группы
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {plan.activeInternalSquads.length === 0 && (
                      <span className="inline-flex items-center gap-1.5 rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-600 dark:bg-white/10 dark:text-slate-300">
                        <Globe2 className="h-3.5 w-3.5" />
                        По умолчанию
                      </span>
                    )}
                    {selectedSquads.slice(0, 2).map((squad) => (
                      <span key={squad.uuid} className="inline-flex max-w-40 items-center gap-1.5 truncate rounded-md bg-cyan-50 px-2 py-1 text-xs text-cyan-800 dark:bg-cyan-400/10 dark:text-cyan-200">
                        <span className={cn('h-1.5 w-1.5 rounded-full', squad.isActive ? 'bg-emerald-500' : 'bg-slate-400')} />
                        {squad.name}
                      </span>
                    ))}
                    {plan.activeInternalSquads.length > 2 && <span className="rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-500">+{plan.activeInternalSquads.length - 2}</span>}
                    {unknownSquads.length > 0 && <span className="rounded-md bg-amber-50 px-2 py-1 text-xs text-amber-700">Не найдено: {unknownSquads.length}</span>}
                  </div>
                </div>

                <div className="flex items-center gap-2 xl:justify-end">
                  <button type="button" className="btn-secondary h-10 min-h-10 px-3" onClick={() => startEdit(plan)} title="Изменить тариф">
                    <Edit3 className="h-4 w-4" />
                  </button>
                  {plan.availability === 'LINK' && (
                    <button type="button" className="btn-secondary h-10 min-h-10 px-3" onClick={() => void copyPlanLink(plan)} title="Скопировать ссылку">
                      <Link2 className="h-4 w-4" />
                    </button>
                  )}
                  <button type="button" className="btn-secondary h-10 min-h-10 px-3 text-red-600" onClick={() => void deletePlan(plan)} disabled={loadingId === plan.id} title="Удалить">
                    <Trash2 className="h-4 w-4" />
                  </button>
                  <button type="button" className="btn-secondary h-10 min-h-10 px-3" onClick={() => void toggleActive(plan)} disabled={loadingId === plan.id} title={plan.isActive ? 'Скрыть тариф' : 'Опубликовать тариф'}>
                    <Power className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </article>
          )
        })}
      </div>
    </div>
  )
}

function PlanEditor({
  form,
  setForm,
  squads,
  squadsLoading,
  squadsError,
  submitLabel,
  loading,
  onSubmit,
}: {
  form: PlanFormState
  setForm: (value: PlanFormState | ((current: PlanFormState) => PlanFormState)) => void
  squads: RemnawaveSquad[]
  squadsLoading: boolean
  squadsError: string | null
  submitLabel: string
  loading: boolean
  onSubmit: () => void
}) {
  const selected = useMemo(() => new Set(parseSquads(form.activeInternalSquads)), [form.activeInternalSquads])
  const set = <K extends keyof PlanFormState>(key: K, value: PlanFormState[K]) =>
    setForm((current) => ({ ...current, [key]: value }))
  const selectAllActive = () =>
    set('activeInternalSquads', squads.filter((squad) => squad.isActive).map((squad) => squad.uuid).join('\n'))
  const toggleSquad = (uuid: string) => {
    const next = selected.has(uuid) ? [...selected].filter((id) => id !== uuid) : [...selected, uuid]
    set('activeInternalSquads', next.join('\n'))
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Field label="Название">
          <input value={form.name} onChange={(event) => set('name', event.target.value)} className="input" placeholder="Стандарт 30 дней" />
        </Field>
        <Field label="Цена, ₽">
          <input value={form.priceRub} onChange={(event) => set('priceRub', event.target.value)} className="input" type="number" min={0} step="0.01" />
        </Field>
        <Field label="Срок, дней">
          <input value={form.durationDays} onChange={(event) => set('durationDays', event.target.value)} className="input" type="number" min={1} />
        </Field>
        <Field label="Устройств">
          <input value={form.deviceLimit} onChange={(event) => set('deviceLimit', event.target.value)} className="input" type="number" min={1} />
        </Field>
        <Field label="Трафик, ГБ">
          <input value={form.trafficLimitGb} onChange={(event) => set('trafficLimitGb', event.target.value)} className="input" type="number" min={1} disabled={form.unlimitedTraffic} placeholder="Безлимит" />
        </Field>
        <Field label="Порядок">
          <input value={form.sortOrder} onChange={(event) => set('sortOrder', event.target.value)} className="input" type="number" min={0} />
        </Field>
        <Toggle checked={form.unlimitedTraffic} onChange={(value) => set('unlimitedTraffic', value)} label="Безлимитный трафик" />
        <Toggle checked={form.isPromo} onChange={(value) => set('isPromo', value)} label="Пробный тариф" />
        <Toggle checked={form.isActive} onChange={(value) => set('isActive', value)} label="Опубликован" />
        <Field label="Кому доступен тариф" className="md:col-span-2">
          <select value={form.availability} onChange={(event) => set('availability', event.target.value as PlanAvailabilityValue)} className="input">
            {Object.entries(planAvailabilityLabels).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </Field>
        <Field label="Описание" className="md:col-span-2 xl:col-span-3">
          <input value={form.description} onChange={(event) => set('description', event.target.value)} className="input" placeholder="Короткое описание для карточки" />
        </Field>
      </div>

      {form.availability === 'ALLOWED' && (
        <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-4 dark:border-amber-500/20 dark:bg-amber-500/5">
          <div className="font-medium">Разрешённые пользователи</div>
          <p className="mt-1 text-xs text-slate-500">
            По одному email или Telegram ID на строку. При синхронизации этот список переносится из Remnashop.
          </p>
          <textarea
            value={form.allowedUsers}
            onChange={(event) => set('allowedUsers', event.target.value)}
            className="input mt-3 min-h-[110px] resize-y font-mono text-xs"
            placeholder={'user@example.com\n123456789'}
          />
        </div>
      )}

      <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-surface-900">
        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="font-medium">Группы Remnawave</div>
            <div className="text-xs text-slate-500">Выберите серверные группы, доступные по тарифу.</div>
          </div>
          <div className="flex gap-2">
            <button type="button" className="btn-secondary px-3 py-2 text-xs" onClick={selectAllActive}>Все активные</button>
            <button type="button" className="btn-secondary px-3 py-2 text-xs" onClick={() => set('activeInternalSquads', '')}>Очистить</button>
          </div>
        </div>
        {squads.length > 0 ? (
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {squads.map((squad) => (
              <button
                key={squad.uuid}
                type="button"
                onClick={() => toggleSquad(squad.uuid)}
                className={cn(
                  'flex min-w-0 items-center gap-3 rounded-lg border px-3 py-3 text-left transition-colors',
                  selected.has(squad.uuid)
                    ? 'border-cyan-300 bg-cyan-50 text-cyan-950 dark:border-cyan-400/40 dark:bg-cyan-400/10 dark:text-cyan-100'
                    : 'border-slate-200 bg-white hover:border-slate-300 dark:border-white/10 dark:bg-surface-900 dark:hover:border-white/20'
                )}
              >
                <span className={cn('grid h-5 w-5 shrink-0 place-items-center rounded border text-xs', selected.has(squad.uuid) ? 'border-cyan-500 bg-cyan-500 text-white' : 'border-slate-300')}>
                  {selected.has(squad.uuid) ? '✓' : ''}
                </span>
                <span className="min-w-0">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">{squad.name}</span>
                    {!squad.isActive && <span className="badge-disabled">off</span>}
                  </span>
                  <span className="block truncate font-mono text-[10px] text-slate-400">{squad.uuid}</span>
                </span>
              </button>
            ))}
          </div>
        ) : (
          <div className="rounded-lg bg-slate-50 px-3 py-4 text-sm text-slate-500 dark:bg-white/5">
            {squadsLoading ? 'Загружаем группы...' : squadsError || 'Группы не найдены'}
          </div>
        )}
        <details className="mt-3">
          <summary className="flex cursor-pointer items-center gap-1 text-xs text-slate-500">
            <ChevronDown className="h-3.5 w-3.5" />
            Ручной ввод UUID
          </summary>
          <textarea value={form.activeInternalSquads} onChange={(event) => set('activeInternalSquads', event.target.value)} className="input mt-2 min-h-[76px] resize-y font-mono text-xs" />
        </details>
      </div>

      <button type="button" className="btn-primary" onClick={onSubmit} disabled={loading}>
        {loading ? 'Сохраняем...' : submitLabel}
      </button>
    </div>
  )
}

function Field({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return <label className={cn('block', className)}><span className="mb-1 block text-sm font-medium">{label}</span>{children}</label>
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (value: boolean) => void; label: string }) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-slate-200 px-3 text-sm dark:border-white/10">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      {label}
    </label>
  )
}

function formFromPlan(plan: PlanAdminRow): PlanFormState {
  return {
    name: plan.name,
    description: plan.description ?? '',
    priceRub: String(plan.priceKopecks / 100),
    durationDays: String(plan.durationDays),
    trafficLimitGb: plan.trafficLimitGb == null ? '' : String(plan.trafficLimitGb),
    unlimitedTraffic: plan.trafficLimitGb == null,
    deviceLimit: String(plan.deviceLimit),
    activeInternalSquads: plan.activeInternalSquads.join('\n'),
    availability: plan.availability,
    allowedUsers: [...plan.allowedEmails, ...plan.allowedTelegramIds].join('\n'),
    sortOrder: String(plan.sortOrder),
    isPromo: plan.isPromo,
    isActive: plan.isActive,
  }
}

function toPayload(form: PlanFormState) {
  return {
    name: form.name,
    description: form.description || null,
    priceKopecks: Math.round(Number(form.priceRub) * 100),
    durationDays: Number(form.durationDays),
    trafficLimitGb: form.unlimitedTraffic || !form.trafficLimitGb ? null : Number(form.trafficLimitGb),
    deviceLimit: Number(form.deviceLimit),
    activeInternalSquads: parseSquads(form.activeInternalSquads),
    availability: form.availability,
    allowedEmails: parseAllowedUsers(form.allowedUsers).emails,
    allowedTelegramIds: parseAllowedUsers(form.allowedUsers).telegramIds,
    sortOrder: Number(form.sortOrder),
    isPromo: form.isPromo,
    isActive: form.isActive,
  }
}

function parseSquads(value: string) {
  return value.split(/[\s,;]+/).map((item) => item.trim()).filter(Boolean)
}

function parseAllowedUsers(value: string) {
  const items = value.split(/[\n,;]+/).map((item) => item.trim()).filter(Boolean)
  return {
    emails: Array.from(new Set(items.filter((item) => item.includes('@')).map((item) => item.toLowerCase()))),
    telegramIds: Array.from(new Set(items.filter((item) => /^\d+$/.test(item)))),
  }
}
