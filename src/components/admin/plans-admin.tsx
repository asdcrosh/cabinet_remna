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
import { AdminEmptyState } from '@/components/admin/admin-empty-state'
import { ConfirmDialog } from '@/components/dashboard/confirm-dialog'

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
  isFeatured: boolean
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
  isFeatured: boolean
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
  isFeatured: false,
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
  const [deleteCandidate, setDeleteCandidate] = useState<PlanAdminRow | null>(null)

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

  function requestDeletePlan(plan: PlanAdminRow) {
    if (plan.paymentsCount > 0 || plan.subscriptionsCount > 0) {
      toast('Используемый тариф можно только скрыть')
      return
    }
    setDeleteCandidate(plan)
  }

  async function deletePlan() {
    if (!deleteCandidate) return
    const plan = deleteCandidate
    setLoadingId(plan.id)
    try {
      await apiFetch(`/api/admin/plans/${plan.id}`, { method: 'DELETE' })
      toast('Тариф удалён', 'success')
      setDeleteCandidate(null)
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
      <div className="flex flex-col gap-4 pb-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-semibold">Каталог тарифов</h2>
          <p className="mt-1 text-sm text-slate-500">{plans.length} тарифов · настройки открываются в отдельном окне</p>
        </div>
        <div className="flex w-full gap-2 sm:w-auto">
          <button type="button" className="btn-secondary flex-1 sm:flex-none" onClick={() => void loadSquads()} disabled={squadsLoading}>
            <RefreshCw className={cn('h-4 w-4', squadsLoading && 'animate-spin')} />
            Группы
          </button>
          <button type="button" className="btn-primary flex-1 sm:flex-none" onClick={() => setCreateOpen(true)}>
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
        <AdminEmptyState
          title="Тарифов пока нет"
          description="Создайте первый тариф, чтобы пользователи могли оформить подписку."
          action={(
            <button type="button" onClick={() => setCreateOpen(true)} className="btn-primary">
              Создать первый тариф
            </button>
          )}
        />
      )}

      {plans.length > 0 && (
        <div data-testid="admin-plan-grid" className="grid gap-4 xl:grid-cols-2">
          {plans.map((plan) => {
            const selectedSquads = plan.activeInternalSquads.map((id) => squadById.get(id)).filter(Boolean) as RemnawaveSquad[]
            const unknownSquads = plan.activeInternalSquads.filter((id) => !squadById.has(id))
            const allowedUsersCount = new Set([...plan.allowedEmails, ...plan.allowedTelegramIds]).size

            return (
              <article
                key={plan.id}
                data-testid="admin-plan-card"
                className="flex h-full min-w-0 flex-col rounded-2xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-white/[0.035] sm:p-5"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="break-words text-lg font-semibold tracking-tight">{plan.name}</h3>
                      <span className={plan.isActive ? 'badge-active' : 'badge-disabled'}>{plan.isActive ? 'Опубликован' : 'Скрыт'}</span>
                      {plan.isPromo && <span className="badge-limited">Пробный</span>}
                      {plan.isFeatured && <span className="badge-active">Популярный</span>}
                    </div>
                    {plan.description && <p className="mt-1 line-clamp-2 text-sm leading-5 text-slate-500 dark:text-slate-400">{plan.description}</p>}
                  </div>
                  <div className="shrink-0 text-right text-xl font-semibold tracking-tight">{formatPrice(plan.priceKopecks)}</div>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-y border-slate-200/70 py-3 dark:border-white/[0.07] sm:grid-cols-3">
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Срок</div>
                    <div className="mt-0.5 text-sm font-medium">{plan.durationDays} дн.</div>
                  </div>
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Трафик</div>
                    <div className="mt-0.5 text-sm font-medium">{plan.trafficLimitGb == null ? 'Безлимит' : `${plan.trafficLimitGb} ГБ`}</div>
                  </div>
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Устройства</div>
                    <div className="mt-0.5 text-sm font-medium">{plan.deviceLimit}</div>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-slate-500 dark:text-slate-400">
                  <span><span className="text-slate-400">Доступ:</span> {planAvailabilityLabels[plan.availability]}</span>
                  {plan.availability === 'ALLOWED' && <span>Пользователей: {allowedUsersCount}</span>}
                  <span>Подписок: {plan.subscriptionsCount}</span>
                  <span>Оплат: {plan.paymentsCount}</span>
                </div>

                <div className="mt-4 min-w-0">
                  <div className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                    <Server className="h-3.5 w-3.5" />
                    Группы Remnawave
                  </div>
                  <div className="flex min-h-7 flex-wrap gap-1.5">
                    {plan.activeInternalSquads.length === 0 && (
                      <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-2 py-1 text-xs text-slate-600 dark:bg-white/10 dark:text-slate-300">
                        <Globe2 className="h-3.5 w-3.5" />
                        По умолчанию
                      </span>
                    )}
                    {selectedSquads.slice(0, 3).map((squad) => (
                      <span key={squad.uuid} className="inline-flex max-w-44 items-center gap-1.5 truncate rounded-lg bg-cyan-50 px-2 py-1 text-xs text-cyan-800 dark:bg-cyan-400/10 dark:text-cyan-200">
                        <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', squad.isActive ? 'bg-emerald-500' : 'bg-slate-400')} />
                        {squad.name}
                      </span>
                    ))}
                    {plan.activeInternalSquads.length > 3 && <span className="rounded-lg bg-slate-100 px-2 py-1 text-xs text-slate-500">+{plan.activeInternalSquads.length - 3}</span>}
                    {unknownSquads.length > 0 && <span className="rounded-lg bg-amber-50 px-2 py-1 text-xs text-amber-700">Не найдено: {unknownSquads.length}</span>}
                  </div>
                </div>

                <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-slate-200/70 pt-4 dark:border-white/[0.07]">
                  <button type="button" className="btn-secondary min-h-10 px-3 py-2 text-xs" onClick={() => startEdit(plan)} aria-label={`Изменить тариф ${plan.name}`}>
                    <Edit3 className="h-4 w-4" />
                    Изменить
                  </button>
                  {plan.availability === 'LINK' && (
                    <button type="button" className="btn-secondary min-h-10 px-3 py-2 text-xs" onClick={() => void copyPlanLink(plan)} aria-label={`Скопировать ссылку на тариф ${plan.name}`}>
                      <Link2 className="h-4 w-4" />
                      Ссылка
                    </button>
                  )}
                  <button
                    type="button"
                    className={cn('btn-secondary min-h-10 px-3 py-2 text-xs', plan.isActive ? 'text-amber-700 dark:text-amber-200' : 'text-emerald-700 dark:text-emerald-200')}
                    onClick={() => void toggleActive(plan)}
                    disabled={loadingId === plan.id}
                    aria-label={`${plan.isActive ? 'Скрыть' : 'Опубликовать'} тариф ${plan.name}`}
                  >
                    <Power className="h-4 w-4" />
                    {plan.isActive ? 'Скрыть' : 'Опубликовать'}
                  </button>
                  <button type="button" className="btn-secondary ml-auto min-h-10 px-3 py-2 text-xs text-red-600 dark:text-red-300" onClick={() => requestDeletePlan(plan)} disabled={loadingId === plan.id} aria-label={`Удалить тариф ${plan.name}`}>
                    <Trash2 className="h-4 w-4" />
                    Удалить
                  </button>
                </div>
              </article>
            )
          })}
        </div>
      )}
      <ConfirmDialog
        open={Boolean(deleteCandidate)}
        title="Удалить тариф"
        description={deleteCandidate ? `Тариф «${deleteCandidate.name}» будет удалён из каталога. Это действие нельзя отменить.` : ''}
        confirmLabel="Удалить"
        loading={Boolean(deleteCandidate && loadingId === deleteCandidate.id)}
        onConfirm={() => void deletePlan()}
        onCancel={() => setDeleteCandidate(null)}
      />
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
        <Toggle checked={form.isFeatured} onChange={(value) => set('isFeatured', value)} label="Популярный тариф" />
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
        <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4 dark:border-amber-500/20 dark:bg-amber-500/5">
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

      <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-surface-900">
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
                  'flex min-w-0 items-center gap-3 rounded-xl border px-3 py-3 text-left transition-colors',
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
          <div className="rounded-xl bg-slate-50 px-3 py-4 text-sm text-slate-500 dark:bg-white/5">
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

      <div className="flex justify-end border-t pt-4">
        <button type="button" className="btn-primary w-full sm:w-auto" onClick={onSubmit} disabled={loading}>
          {loading ? 'Сохраняем...' : submitLabel}
        </button>
      </div>
    </div>
  )
}

function Field({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return <label className={cn('block', className)}><span className="mb-1 block text-sm font-medium">{label}</span>{children}</label>
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (value: boolean) => void; label: string }) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-slate-200 px-3 text-sm dark:border-white/10">
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
    isFeatured: plan.isFeatured,
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
    isFeatured: form.isFeatured,
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
