'use client'

import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Archive, CheckCheck, Edit3, Gift, Plus, Power, TicketCheck, Trash2, UserRound, Wand2 } from 'lucide-react'
import { apiFetch } from '@/lib/api-client'
import { toast } from '@/components/ui/toaster'
import { cn } from '@/lib/cn'
import { AdminEmptyState } from '@/components/admin/admin-empty-state'
import { AdminModal } from '@/components/admin/admin-modal'
import { ConfirmDialog } from '@/components/dashboard/confirm-dialog'
import { ADMIN_LIST_PAGE_SIZE } from '@/lib/admin-list'

type PromoAudience = 'ALL' | 'NEW_USERS' | 'NO_ACTIVE_SUBSCRIPTION' | 'PERSONAL'
type PromoAssigneeSource = 'PERSONAL' | 'BONUS_BOX' | 'WELCOME_BONUS' | 'REDEMPTION'
type PromoOrigin = 'CREATED' | 'MY_BOX' | 'OTHER_BOX'

export interface PromoCodeAssignee {
  id: string
  userId: string | null
  email: string
  name: string | null
  source: PromoAssigneeSource
  sourceLabel: string
  createdAt: string | null
}

export interface PromoCodeAdminRow {
  id: string
  code: string
  discountPercent: number
  audience: PromoAudience
  allowedEmails: string[]
  isActive: boolean
  startsAt: string | null
  expiresAt: string | null
  maxUses: number | null
  maxUsesPerUser: number
  usedCount: number
  reservedCount: number
  planIds: string[]
  planNames: string[]
  assignees: PromoCodeAssignee[]
  origin: PromoOrigin
}

export interface PromoPlanOption {
  id: string
  name: string
}

interface PromoCodeFormState {
  code: string
  discountPercent: string
  audience: PromoAudience
  allowedEmails: string
  isActive: boolean
  startsAt: string
  expiresAt: string
  maxUses: string
  maxUsesPerUser: string
  planIds: string[]
}

const emptyForm: PromoCodeFormState = {
  code: '',
  discountPercent: '10',
  audience: 'ALL',
  allowedEmails: '',
  isActive: true,
  startsAt: '',
  expiresAt: '',
  maxUses: '',
  maxUsesPerUser: '1',
  planIds: [],
}

export function PromoCodesAdmin({
  promoCodes,
  plans,
  initialQuery = '',
}: {
  promoCodes: PromoCodeAdminRow[]
  plans: PromoPlanOption[]
  initialQuery?: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<PromoCodeFormState>(emptyForm)
  const [loading, setLoading] = useState(false)
  const [editorOpen, setEditorOpen] = useState(false)
  const [tab, setTab] = useState<'AVAILABLE' | 'USED' | 'ARCHIVE'>('AVAILABLE')
  const [origin, setOrigin] = useState<'ALL' | PromoOrigin>('ALL')
  const [query, setQuery] = useState(initialQuery)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [confirmAction, setConfirmAction] = useState<{
    title: string
    description: string
    label: string
    run: () => Promise<void>
  } | null>(null)

  const editingPromo = useMemo(
    () => promoCodes.find((promoCode) => promoCode.id === editingId) ?? null,
    [editingId, promoCodes]
  )

  useEffect(() => {
    setQuery(initialQuery)
  }, [initialQuery])

  useEffect(() => {
    const handle = window.setTimeout(() => {
      const normalized = query.trim()
      if (normalized === (searchParams.get('q') ?? '').trim()) return
      const next = new URLSearchParams(searchParams.toString())
      if (normalized) {
        next.set('q', normalized)
        next.set('limit', String(ADMIN_LIST_PAGE_SIZE))
      } else {
        next.delete('q')
        next.delete('limit')
      }
      const href = next.toString() ? `${pathname}?${next.toString()}` : pathname
      router.replace(href, { scroll: false })
    }, 350)

    return () => window.clearTimeout(handle)
  }, [pathname, query, router, searchParams])

  async function submit() {
    setLoading(true)
    try {
      await apiFetch(editingId ? `/api/admin/promo-codes/${editingId}` : '/api/admin/promo-codes', {
        method: editingId ? 'PATCH' : 'POST',
        body: JSON.stringify({
          code: form.code,
          discountPercent: Number(form.discountPercent),
          audience: form.audience,
          allowedEmails: form.audience === 'PERSONAL' ? parseAllowedEmails(form.allowedEmails) : [],
          isActive: form.isActive,
          startsAt: form.startsAt ? new Date(form.startsAt).toISOString() : null,
          expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : null,
          maxUses: form.maxUses ? Number(form.maxUses) : null,
          maxUsesPerUser: Number(form.maxUsesPerUser),
          planIds: form.planIds,
        }),
      })
      toast(editingId ? 'Промокод обновлён' : 'Промокод создан', 'success')
      resetForm()
      router.refresh()
    } catch {
      // apiFetch уже покажет toast
    } finally {
      setLoading(false)
    }
  }

  async function toggleActive(promoCode: PromoCodeAdminRow) {
    try {
      await apiFetch(`/api/admin/promo-codes/${promoCode.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: !promoCode.isActive }),
      })
      toast(promoCode.isActive ? 'Промокод отключён' : 'Промокод включён', 'success')
      router.refresh()
    } catch {
      // apiFetch уже покажет toast
    }
  }

  async function deletePromoCode(promoCode: PromoCodeAdminRow) {
    setConfirmAction({
      title: 'Удалить промокод',
      description: `Промокод ${promoCode.code} будет удалён. История оплат сохранится без привязки к этому коду.`,
      label: 'Удалить',
      run: async () => {
        await performDeletePromoCode(promoCode)
      },
    })
  }

  async function performDeletePromoCode(promoCode: PromoCodeAdminRow) {
    try {
      await apiFetch(`/api/admin/promo-codes/${promoCode.id}`, { method: 'DELETE' })
      toast('Промокод удалён', 'success')
      router.refresh()
    } catch {
      // apiFetch уже покажет toast
    }
  }

  async function deleteSelectedPromoCodes() {
    const selectedCodes = promoCodes.filter((promoCode) => selectedIds.includes(promoCode.id))
    if (selectedCodes.length === 0) return
    setConfirmAction({
      title: 'Удалить промокоды',
      description: `Будет удалено промокодов: ${selectedCodes.length}. История оплат сохранится без привязки к этим кодам.`,
      label: 'Удалить',
      run: async () => {
        await performDeleteSelectedPromoCodes()
      },
    })
  }

  async function performDeleteSelectedPromoCodes() {
    setLoading(true)
    try {
      const result = await apiFetch<{ deleted: number }>('/api/admin/promo-codes', {
        method: 'DELETE',
        body: JSON.stringify({ ids: selectedIds }),
      })
      toast(`Удалено промокодов: ${result.deleted}`, 'success')
      setSelectedIds([])
      router.refresh()
    } catch {
      // apiFetch уже покажет toast
    } finally {
      setLoading(false)
    }
  }

  async function updateSelectedActive(isActive: boolean) {
    const selectedCodes = promoCodes.filter((promoCode) => selectedIds.includes(promoCode.id))
    if (selectedCodes.length === 0) return
    setConfirmAction({
      title: isActive ? 'Включить промокоды' : 'Отключить промокоды',
      description: `${isActive ? 'Включить' : 'Отключить'} выбранные промокоды: ${selectedCodes.length}.`,
      label: isActive ? 'Включить' : 'Отключить',
      run: async () => {
        await performUpdateSelectedActive(isActive)
      },
    })
  }

  async function performUpdateSelectedActive(isActive: boolean) {
    setLoading(true)
    try {
      const result = await apiFetch<{ updated: number }>('/api/admin/promo-codes', {
        method: 'PATCH',
        body: JSON.stringify({ ids: selectedIds, isActive }),
      })
      toast(`${isActive ? 'Включено' : 'Отключено'} промокодов: ${result.updated}`, 'success')
      setSelectedIds([])
      router.refresh()
    } catch {
      // apiFetch уже покажет toast
    } finally {
      setLoading(false)
    }
  }

  async function runConfirmedAction() {
    const action = confirmAction
    if (!action) return
    try {
      await action.run()
      setConfirmAction(null)
    } catch {
      // apiFetch уже покажет ошибку.
    }
  }

  function startEdit(promoCode: PromoCodeAdminRow) {
    setEditingId(promoCode.id)
    setForm({
      code: promoCode.code,
      discountPercent: String(promoCode.discountPercent),
      audience: promoCode.audience,
      allowedEmails: promoCode.allowedEmails.join('\n'),
      isActive: promoCode.isActive,
      startsAt: toLocalDateTime(promoCode.startsAt),
      expiresAt: toLocalDateTime(promoCode.expiresAt),
      maxUses: promoCode.maxUses == null ? '' : String(promoCode.maxUses),
      maxUsesPerUser: String(promoCode.maxUsesPerUser),
      planIds: promoCode.planIds,
    })
    setEditorOpen(true)
  }

  function resetForm() {
    setEditingId(null)
    setForm(emptyForm)
    setEditorOpen(false)
  }

  function startCreate() {
    setEditingId(null)
    setForm(emptyForm)
    setEditorOpen(true)
  }

  function togglePlan(planId: string) {
    setForm((current) => ({
      ...current,
      planIds: current.planIds.includes(planId)
        ? current.planIds.filter((id) => id !== planId)
        : [...current.planIds, planId],
    }))
  }

  const normalizedQuery = query.trim().toLowerCase()
  const filteredPromoCodes = promoCodes.filter((promoCode) => {
    const matchesStatus = promoStatus(promoCode) === tab
    const matchesOrigin = origin === 'ALL' || promoCode.origin === origin
    const matchesQuery = !normalizedQuery || [
      promoCode.code,
      ...promoCode.allowedEmails,
      ...promoCode.assignees.map((assignee) => `${assignee.email} ${assignee.name ?? ''}`),
    ].some((value) => value.toLowerCase().includes(normalizedQuery))
    return matchesStatus && matchesOrigin && matchesQuery
  })
  const filteredIds = filteredPromoCodes.map((promoCode) => promoCode.id)
  const selectedInTab = filteredIds.filter((id) => selectedIds.includes(id))
  const allInTabSelected = filteredIds.length > 0 && selectedInTab.length === filteredIds.length
  const counts = promoCodes.reduce((result, promoCode) => {
    result[promoStatus(promoCode)] += 1
    return result
  }, { AVAILABLE: 0, USED: 0, ARCHIVE: 0 })
  const originCounts = promoCodes.reduce((result, promoCode) => {
    result.ALL += 1
    result[promoCode.origin] += 1
    return result
  }, { ALL: 0, CREATED: 0, MY_BOX: 0, OTHER_BOX: 0 })

  function toggleSelected(id: string) {
    setSelectedIds((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id]
    )
  }

  function toggleSelectedInTab() {
    setSelectedIds((current) => {
      const currentSet = new Set(current)
      if (allInTabSelected) {
        filteredIds.forEach((id) => currentSet.delete(id))
      } else {
        filteredIds.forEach((id) => currentSet.add(id))
      }
      return Array.from(currentSet)
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-lg border bg-white p-4 dark:bg-surface-900 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-semibold">Промокоды</h2>
          <p className="mt-1 text-sm text-slate-500">Скидки, ограничения и доступные тарифы</p>
        </div>
        <button type="button" className="btn-primary" onClick={startCreate}>
          <Plus className="h-4 w-4" />
          Новый промокод
        </button>
      </div>

      <div className="flex gap-1 overflow-x-auto rounded-lg border bg-white p-1 dark:bg-surface-900">
        {([
          ['AVAILABLE', 'Не использованы', TicketCheck],
          ['USED', 'Использованы', CheckCheck],
          ['ARCHIVE', 'Архив', Archive],
        ] as const).map(([value, label, Icon]) => (
          <button
            key={value}
            type="button"
            onClick={() => setTab(value)}
            className={cn(
              'inline-flex min-h-10 shrink-0 items-center gap-2 rounded-md px-3 text-sm font-medium transition-colors',
              tab === value ? 'bg-slate-950 text-white dark:bg-white dark:text-slate-950' : 'text-slate-500 hover:bg-slate-50 dark:hover:bg-white/5'
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
            <span className={cn('rounded-full px-1.5 text-xs', tab === value ? 'bg-white/15' : 'bg-slate-100 dark:bg-white/10')}>
              {counts[value]}
            </span>
          </button>
        ))}
      </div>

      <div className="flex gap-1 overflow-x-auto rounded-lg border bg-white p-1 dark:bg-surface-900">
        {([
          ['ALL', 'Все', TicketCheck],
          ['CREATED', 'Созданные', Wand2],
          ['MY_BOX', 'Мои из бокса', Gift],
          ['OTHER_BOX', 'Чужие из бокса', UserRound],
        ] as const).map(([value, label, Icon]) => (
          <button
            key={value}
            type="button"
            onClick={() => {
              setOrigin(value)
              setSelectedIds([])
            }}
            className={cn(
              'inline-flex min-h-10 shrink-0 items-center gap-2 rounded-md px-3 text-sm font-medium transition-colors',
              origin === value ? 'bg-slate-950 text-white dark:bg-white dark:text-slate-950' : 'text-slate-500 hover:bg-slate-50 dark:hover:bg-white/5'
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
            <span className={cn('rounded-full px-1.5 text-xs', origin === value ? 'bg-white/15' : 'bg-slate-100 dark:bg-white/10')}>
              {originCounts[value]}
            </span>
          </button>
        ))}
      </div>

      <div className="rounded-lg border bg-white p-3 dark:bg-surface-900">
        <input
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            setSelectedIds([])
          }}
          className="input"
          placeholder="Поиск по коду, email или имени"
        />
      </div>

      <div className="flex flex-col gap-3 rounded-lg border bg-white p-3 dark:bg-surface-900 sm:flex-row sm:items-center sm:justify-between">
        <label className="flex min-h-10 items-center gap-3 text-sm font-medium text-slate-600 dark:text-slate-300">
          <input
            type="checkbox"
            checked={allInTabSelected}
            onChange={toggleSelectedInTab}
            disabled={filteredIds.length === 0}
          />
          Выбрать в текущем разделе
          {selectedIds.length > 0 && (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500 dark:bg-white/10">
              выбрано {selectedIds.length}
            </span>
          )}
        </label>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn-secondary"
            onClick={() => void updateSelectedActive(true)}
            disabled={selectedIds.length === 0 || loading}
          >
            <Power className="h-4 w-4" />
            Включить
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => void updateSelectedActive(false)}
            disabled={selectedIds.length === 0 || loading}
          >
            <Archive className="h-4 w-4" />
            Отключить
          </button>
          <button
            type="button"
            className="btn-secondary text-red-600 hover:border-red-200 hover:bg-red-50 hover:text-red-700 dark:text-red-300 dark:hover:border-red-500/30 dark:hover:bg-red-500/10"
            onClick={() => void deleteSelectedPromoCodes()}
            disabled={selectedIds.length === 0 || loading}
          >
            <Trash2 className="h-4 w-4" />
            Удалить выбранные
          </button>
        </div>
      </div>

      <AdminModal
        open={editorOpen}
        title={editingPromo ? `Промокод ${editingPromo.code}` : 'Новый промокод'}
        description="Скидка, лимиты использования и доступные тарифы"
        onClose={resetForm}
        size="lg"
      >
        <div className="space-y-5">
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Код">
              <input
                value={form.code}
                onChange={(event) => setForm((current) => ({ ...current, code: event.target.value }))}
                className="input"
                placeholder="SUMMER20"
              />
            </Field>
            <Field label="Скидка, %">
              <input
                value={form.discountPercent}
                onChange={(event) => setForm((current) => ({ ...current, discountPercent: event.target.value }))}
                className="input"
                type="number"
                min={1}
                max={99}
              />
            </Field>
            <Field label="Общий лимит">
              <input
                value={form.maxUses}
                onChange={(event) => setForm((current) => ({ ...current, maxUses: event.target.value }))}
                className="input"
                type="number"
                min={1}
                placeholder="Без лимита"
              />
            </Field>
            <Field label="На пользователя">
              <input
                value={form.maxUsesPerUser}
                onChange={(event) => setForm((current) => ({ ...current, maxUsesPerUser: event.target.value }))}
                className="input"
                type="number"
                min={1}
              />
            </Field>
            <Field label="Начало">
              <input
                value={form.startsAt}
                onChange={(event) => setForm((current) => ({ ...current, startsAt: event.target.value }))}
                className="input"
                type="datetime-local"
              />
            </Field>
            <Field label="Окончание">
              <input
                value={form.expiresAt}
                onChange={(event) => setForm((current) => ({ ...current, expiresAt: event.target.value }))}
                className="input"
                type="datetime-local"
              />
            </Field>
            <Field label="Кому доступен">
              <select
                value={form.audience}
                onChange={(event) => setForm((current) => ({
                  ...current,
                  audience: event.target.value as PromoAudience,
                  allowedEmails: event.target.value === 'PERSONAL' ? current.allowedEmails : '',
                }))}
                className="input min-h-11"
              >
                <option value="ALL">Всем пользователям</option>
                <option value="NEW_USERS">Новым пользователям</option>
                <option value="NO_ACTIVE_SUBSCRIPTION">Без активной подписки</option>
                <option value="PERSONAL">Персональный список</option>
              </select>
            </Field>
            <Field label="Пользователи">
              <textarea
                value={form.allowedEmails}
                onChange={(event) => setForm((current) => ({ ...current, allowedEmails: event.target.value }))}
                className="input min-h-11 resize-y"
                placeholder="email@example.com"
                disabled={form.audience !== 'PERSONAL'}
              />
            </Field>
          </div>

          <label className="flex min-h-11 items-center gap-3 rounded-lg border px-3 text-sm">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(event) => setForm((current) => ({ ...current, isActive: event.target.checked }))}
            />
            Промокод активен
          </label>

          <div>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-sm font-medium">Тарифы</div>
                <div className="text-xs text-slate-500">
                  {form.planIds.length === 0 ? 'Действует на все тарифы' : `Выбрано ${form.planIds.length} из ${plans.length}`}
                </div>
              </div>
              <div className="flex gap-2">
                <button type="button" className="btn-secondary px-3 py-2 text-xs" onClick={() => setForm((current) => ({ ...current, planIds: plans.map((plan) => plan.id) }))}>
                  <CheckCheck className="h-3.5 w-3.5" />
                  Все
                </button>
                <button type="button" className="btn-secondary px-3 py-2 text-xs" onClick={() => setForm((current) => ({ ...current, planIds: [] }))}>
                  Очистить
                </button>
              </div>
            </div>
            <div className="grid max-h-56 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
              {plans.map((plan) => (
                <button
                  key={plan.id}
                  type="button"
                  onClick={() => togglePlan(plan.id)}
                  className={cn(
                    'flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors',
                    form.planIds.includes(plan.id)
                      ? 'border-brand-300 bg-brand-50 text-brand-700 dark:border-brand-500/60 dark:bg-brand-500/10 dark:text-brand-200'
                      : 'bg-white text-slate-600 hover:bg-slate-50 dark:bg-surface-900 dark:text-slate-300'
                  )}
                >
                  <span className={cn('grid h-5 w-5 shrink-0 place-items-center rounded border text-xs', form.planIds.includes(plan.id) && 'border-brand-500 bg-brand-500 text-white')}>
                    {form.planIds.includes(plan.id) ? '✓' : ''}
                  </span>
                  {plan.name}
                </button>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2 border-t pt-4">
            <button type="button" className="btn-secondary" onClick={resetForm}>Отмена</button>
            <button type="button" className="btn-primary" onClick={submit} disabled={loading}>
              {loading ? 'Сохраняем...' : editingId ? 'Сохранить' : 'Создать'}
            </button>
          </div>
        </div>
      </AdminModal>

      <div className="overflow-hidden rounded-lg border bg-white dark:bg-surface-900">
        {filteredPromoCodes.map((promoCode) => (
          <article key={promoCode.id} className="grid gap-4 border-b p-4 last:border-b-0 lg:grid-cols-[minmax(13rem,1fr)_minmax(12rem,.9fr)_minmax(13rem,1fr)_minmax(12rem,.8fr)_auto] lg:items-center">
            <div className="flex min-w-0 items-start gap-3">
              <input
                className="mt-1.5 shrink-0"
                type="checkbox"
                checked={selectedIds.includes(promoCode.id)}
                onChange={() => toggleSelected(promoCode.id)}
                aria-label={`Выбрать промокод ${promoCode.code}`}
              />
              <div className="min-w-0">
                <div className="flex min-w-0 items-center gap-2">
                  <div className="truncate font-mono text-base font-semibold" title={promoCode.code}>{promoCode.code}</div>
                  <span className={cn('shrink-0', tab === 'AVAILABLE' ? 'badge-active' : tab === 'USED' ? 'badge-disabled' : 'badge-limited')}>
                    {tab === 'AVAILABLE' ? 'Активен' : tab === 'USED' ? 'Использован' : 'Архив'}
                  </span>
                </div>
                <div className="mt-1">
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500 dark:bg-white/10 dark:text-slate-300">
                    {originTitle(promoCode.origin)}
                  </span>
                </div>
                <div className="mt-1 text-xl font-semibold text-emerald-600">-{promoCode.discountPercent}%</div>
              </div>
            </div>
            <div className="min-w-0">
              <div className="text-[11px] font-semibold uppercase text-slate-400">Тарифы</div>
              <div className="mt-1 truncate text-sm text-slate-600 dark:text-slate-300">{promoCode.planNames.length > 0 ? promoCode.planNames.join(', ') : 'Все тарифы'}</div>
              <div className="mt-2 text-[11px] font-semibold uppercase text-slate-400">Доступ</div>
              <div className="mt-1 truncate text-sm text-slate-600 dark:text-slate-300" title={audienceTitle(promoCode)}>
                {audienceTitle(promoCode)}
              </div>
            </div>
            <AssigneesBlock assignees={promoCode.assignees} />
            <div className="grid min-w-0 grid-cols-3 gap-2 text-sm lg:grid-cols-1 xl:grid-cols-3">
              <CompactFact label="Исп." value={`${promoCode.usedCount}/${promoCode.maxUses ?? '∞'}`} />
              <CompactFact label="На одного" value={String(promoCode.maxUsesPerUser)} />
              <CompactFact label="Срок" value={formatRange(promoCode.startsAt, promoCode.expiresAt)} />
            </div>
            <div className="flex shrink-0 gap-2 lg:justify-end">
              <button type="button" className="btn-secondary h-10 min-h-10 px-3" onClick={() => startEdit(promoCode)} title="Изменить">
                <Edit3 className="h-4 w-4" />
              </button>
              <button type="button" className="btn-secondary h-10 min-h-10 px-3" onClick={() => toggleActive(promoCode)} title={promoCode.isActive ? 'Отключить' : 'Включить'}>
                <Power className="h-4 w-4" />
              </button>
              <button
                type="button"
                className="btn-secondary h-10 min-h-10 px-3 text-red-600 hover:border-red-200 hover:bg-red-50 hover:text-red-700 dark:text-red-300 dark:hover:border-red-500/30 dark:hover:bg-red-500/10"
                onClick={() => void deletePromoCode(promoCode)}
                title="Удалить"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </article>
        ))}
      </div>

      {filteredPromoCodes.length === 0 && (
        <AdminEmptyState
          title="Промокодов пока нет"
          description="В этом разделе пока нет промокодов."
        />
      )}
      <ConfirmDialog
        open={Boolean(confirmAction)}
        title={confirmAction?.title ?? ''}
        description={confirmAction?.description ?? ''}
        confirmLabel={confirmAction?.label ?? 'Подтвердить'}
        loading={loading}
        onConfirm={() => void runConfirmedAction()}
        onCancel={() => setConfirmAction(null)}
      />
    </div>
  )
}

function AssigneesBlock({ assignees }: { assignees: PromoCodeAssignee[] }) {
  const firstAssignee = assignees[0]
  const hiddenCount = Math.max(0, assignees.length - 1)

  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase text-slate-400">
        <UserRound className="h-3.5 w-3.5" />
        За кем числится
      </div>
      {firstAssignee ? (
        <div className="mt-1 min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <Link
              href={`/dashboard/admin/users?q=${encodeURIComponent(firstAssignee.email)}`}
              className="truncate text-sm font-medium text-slate-800 hover:text-brand-600 dark:text-slate-100 dark:hover:text-brand-200"
              title={firstAssignee.email}
            >
              {firstAssignee.name || firstAssignee.email}
            </Link>
            {hiddenCount > 0 ? (
              <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500 dark:bg-white/10 dark:text-slate-300">
                +{hiddenCount}
              </span>
            ) : null}
          </div>
          <div className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">
            {firstAssignee.name ? firstAssignee.email : firstAssignee.createdAt ? formatDate(firstAssignee.createdAt) : 'Пользователь'}
          </div>
          {firstAssignee.name && firstAssignee.createdAt ? (
            <div className="mt-0.5 text-xs text-slate-400">{formatDate(firstAssignee.createdAt)}</div>
          ) : null}
          {hiddenCount > 0 ? (
            <div className="mt-0.5 truncate text-xs text-slate-400" title={assignees.slice(1).map((assignee) => assignee.email).join(', ')}>
              {assignees.slice(1).map((assignee) => assignee.email).join(', ')}
            </div>
          ) : null}
        </div>
      ) : (
        <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">Не закреплён за пользователем</div>
      )}
    </div>
  )
}

function CompactFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] uppercase text-slate-400">{label}</div>
      <div className="mt-1 truncate font-medium" title={value}>{value}</div>
    </div>
  )
}

function promoStatus(promoCode: PromoCodeAdminRow): 'AVAILABLE' | 'USED' | 'ARCHIVE' {
  const now = Date.now()
  const expired = promoCode.expiresAt ? new Date(promoCode.expiresAt).getTime() < now : false
  const exhausted = promoCode.maxUses != null && promoCode.usedCount >= promoCode.maxUses
  if (!promoCode.isActive || expired || exhausted) return 'ARCHIVE'
  if (promoCode.usedCount > 0) return 'USED'
  return 'AVAILABLE'
}

function audienceTitle(promoCode: PromoCodeAdminRow) {
  if (promoCode.audience === 'NEW_USERS') return 'Новые пользователи'
  if (promoCode.audience === 'NO_ACTIVE_SUBSCRIPTION') return 'Без активной подписки'
  if (promoCode.audience === 'PERSONAL') {
    return promoCode.allowedEmails.length > 0
      ? `Персональный: ${promoCode.allowedEmails.join(', ')}`
      : 'Персональный список'
  }
  return 'Все пользователи'
}

function originTitle(origin: PromoOrigin) {
  if (origin === 'MY_BOX') return 'Мой бокс'
  if (origin === 'OTHER_BOX') return 'Чужой бокс'
  return 'Создан вручную'
}

function parseAllowedEmails(value: string) {
  return Array.from(
    new Set(
      value
        .split(/[\s,;]+/)
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean)
    )
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium">{label}</span>
      {children}
    </label>
  )
}

function toLocalDateTime(value: string | null) {
  if (!value) return ''
  const date = new Date(value)
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

function formatRange(startsAt: string | null, expiresAt: string | null) {
  if (!startsAt && !expiresAt) return 'Без срока'
  const start = startsAt ? new Date(startsAt).toLocaleDateString('ru-RU') : 'сейчас'
  const end = expiresAt ? new Date(expiresAt).toLocaleDateString('ru-RU') : 'без конца'
  return `${start} - ${end}`
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString('ru-RU')
}
