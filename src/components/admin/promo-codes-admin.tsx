'use client'

import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Archive, CheckCheck, Edit3, Plus, Power, Search, TicketCheck, Trash2, UserRound, X } from 'lucide-react'
import { apiFetch } from '@/lib/api-client'
import { toast } from '@/components/ui/toaster'
import { cn } from '@/lib/cn'
import { AdminEmptyState } from '@/components/admin/admin-empty-state'
import { AdminActionsMenu } from '@/components/admin/admin-actions-menu'
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
      <section className="rounded-3xl border border-slate-200 bg-white p-3 dark:border-white/10 dark:bg-white/[0.03] sm:p-4">
        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value)
                setSelectedIds([])
              }}
              className="input pl-9 pr-10"
              placeholder="Код, email или имя"
            />
            {query && (
              <button
                type="button"
                className="absolute right-1.5 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-xl text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/10 dark:hover:text-slate-100"
                onClick={() => {
                  setQuery('')
                  setSelectedIds([])
                }}
                aria-label="Очистить поиск"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <button type="button" className="btn-primary w-full justify-center sm:w-auto" onClick={startCreate}>
            <Plus className="h-4 w-4" />
            Новый промокод
          </button>
        </div>

        <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_14rem]">
          <div className="min-w-0">
            <div data-testid="promo-status-filter" aria-label="Статус промокодов" className="grid grid-cols-3 gap-1 rounded-xl bg-slate-100/80 p-1 dark:bg-white/[0.05]">
              {([
                ['AVAILABLE', 'Доступны', TicketCheck],
                ['USED', 'Использованы', CheckCheck],
                ['ARCHIVE', 'Архив', Archive],
              ] as const).map(([value, label, Icon]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setTab(value)}
                  className={cn(
                    'inline-flex h-10 min-w-0 items-center justify-center gap-1 rounded-lg px-1.5 text-[11px] font-medium transition-colors sm:gap-1.5 sm:px-2 sm:text-sm',
                    tab === value ? 'bg-slate-950 text-white dark:bg-white dark:text-slate-950' : 'text-slate-500 hover:bg-white/70 dark:hover:bg-white/5'
                  )}
                >
                  <Icon className="hidden h-4 w-4 sm:block" />
                  <span className="truncate">{label}</span>
                  <span className={cn('rounded-full px-1.5 text-xs', tab === value ? 'bg-white/15' : 'bg-white dark:bg-white/10')}>
                    {counts[value]}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="min-w-0">
            <select
              data-testid="promo-origin-filter"
              aria-label="Источник промокодов"
              className="input h-11"
              value={origin}
              onChange={(event) => {
                setOrigin(event.target.value as 'ALL' | PromoOrigin)
                setSelectedIds([])
              }}
            >
              <option value="ALL">Все · {originCounts.ALL}</option>
              <option value="CREATED">Созданные · {originCounts.CREATED}</option>
              <option value="MY_BOX">Мои из бокса · {originCounts.MY_BOX}</option>
              <option value="OTHER_BOX">Чужие из бокса · {originCounts.OTHER_BOX}</option>
            </select>
          </div>
        </div>
      </section>

      <div className={selectedIds.length > 0 ? 'admin-bulk-bar' : 'flex items-center justify-between px-1'}>
        <label className="flex min-h-10 items-center gap-3 text-sm font-medium text-slate-600 dark:text-slate-300">
          <input
            type="checkbox"
            checked={allInTabSelected}
            onChange={toggleSelectedInTab}
            disabled={filteredIds.length === 0}
          />
          Выбрать все
          {selectedIds.length > 0 && (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500 dark:bg-white/10">
              выбрано {selectedIds.length}
            </span>
          )}
        </label>
        {selectedIds.length === 0 && (
          <span className="text-xs text-slate-400">
            Показано {filteredPromoCodes.length} из {promoCodes.length}
          </span>
        )}
        {selectedIds.length > 0 && <div className="grid w-full grid-cols-2 gap-2 sm:w-auto sm:flex sm:flex-wrap">
          <button
            type="button"
            className="btn-secondary justify-center"
            onClick={() => void updateSelectedActive(true)}
            disabled={selectedIds.length === 0 || loading}
          >
            <Power className="h-4 w-4" />
            Включить
          </button>
          <button
            type="button"
            className="btn-secondary justify-center"
            onClick={() => void updateSelectedActive(false)}
            disabled={selectedIds.length === 0 || loading}
          >
            <Archive className="h-4 w-4" />
            Отключить
          </button>
          <button
            type="button"
            className="btn-secondary col-span-2 justify-center text-red-600 hover:border-red-200 hover:bg-red-50 hover:text-red-700 dark:text-red-300 dark:hover:border-red-500/30 dark:hover:bg-red-500/10 sm:col-span-1"
            onClick={() => void deleteSelectedPromoCodes()}
            disabled={selectedIds.length === 0 || loading}
          >
            <Trash2 className="h-4 w-4" />
            Удалить выбранные
          </button>
        </div>}
      </div>

      <AdminModal
        open={editorOpen}
        title={editingPromo ? `Промокод ${editingPromo.code}` : 'Новый промокод'}
        description="Скидка, лимиты использования и доступные тарифы"
        onClose={resetForm}
        size="lg"
      >
        <div className="space-y-5">
          <section className="rounded-3xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-surface-900/60 sm:p-5">
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Код">
                <input
                  value={form.code}
                  onChange={(event) => setForm((current) => ({ ...current, code: event.target.value }))}
                  className="input font-mono uppercase"
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
              <label className={cn(
                'flex min-h-11 cursor-pointer items-center gap-3 rounded-2xl border px-3 text-sm font-medium transition-colors',
                form.isActive
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-100'
                  : 'border-slate-200 bg-slate-50 text-slate-500 dark:border-white/10 dark:bg-white/[0.03]'
              )}>
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(event) => setForm((current) => ({ ...current, isActive: event.target.checked }))}
                />
                {form.isActive ? 'Промокод активен' : 'Промокод выключен'}
              </label>
            </div>

            {form.audience === 'PERSONAL' && (
              <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50/70 p-3 dark:border-amber-500/20 dark:bg-amber-500/5">
                <Field label="Персональный список">
                  <textarea
                    value={form.allowedEmails}
                    onChange={(event) => setForm((current) => ({ ...current, allowedEmails: event.target.value }))}
                    className="input min-h-24 resize-y font-mono text-sm"
                    placeholder="email@example.com"
                  />
                </Field>
                <p className="mt-2 text-xs text-slate-500">Добавляйте email через пробел, запятую или с новой строки.</p>
              </div>
            )}
          </section>

          <details className="rounded-3xl border border-slate-200 bg-slate-50/70 p-4 dark:border-white/10 dark:bg-white/[0.03]">
            <summary className="cursor-pointer text-sm font-semibold text-slate-950 dark:text-white">Сроки и лимиты</summary>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <Field label="Общий лимит">
                <input value={form.maxUses} onChange={(event) => setForm((current) => ({ ...current, maxUses: event.target.value }))} className="input" type="number" min={1} placeholder="Без лимита" />
              </Field>
              <Field label="На пользователя">
                <input value={form.maxUsesPerUser} onChange={(event) => setForm((current) => ({ ...current, maxUsesPerUser: event.target.value }))} className="input" type="number" min={1} />
              </Field>
              <Field label="Начало">
                <input value={form.startsAt} onChange={(event) => setForm((current) => ({ ...current, startsAt: event.target.value }))} className="input" type="datetime-local" />
              </Field>
              <Field label="Окончание">
                <input value={form.expiresAt} onChange={(event) => setForm((current) => ({ ...current, expiresAt: event.target.value }))} className="input" type="datetime-local" />
              </Field>
            </div>
          </details>

          <details className="rounded-3xl border border-slate-200 bg-slate-50/70 p-4 dark:border-white/10 dark:bg-white/[0.03]">
            <summary className="cursor-pointer text-sm font-semibold text-slate-950 dark:text-white">
              Тарифы · {form.planIds.length === 0 ? 'все' : `выбрано ${form.planIds.length}`}
            </summary>
            <div className="mt-4">
              <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="text-sm font-medium">Тарифы</div>
                  <div className="text-xs text-slate-500">
                    {form.planIds.length === 0 ? 'Действует на все тарифы' : `Выбрано ${form.planIds.length} из ${plans.length}`}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:flex">
                  <button type="button" className="btn-secondary justify-center px-3 py-2 text-xs" onClick={() => setForm((current) => ({ ...current, planIds: plans.map((plan) => plan.id) }))}>
                    <CheckCheck className="h-3.5 w-3.5" />
                    Все
                  </button>
                  <button type="button" className="btn-secondary justify-center px-3 py-2 text-xs" onClick={() => setForm((current) => ({ ...current, planIds: [] }))}>
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
                      'flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left text-sm transition-colors',
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
          </details>

          <div className="sticky -bottom-5 -mx-4 grid grid-cols-2 gap-2 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur dark:border-white/10 dark:bg-surface-900/95 sm:-mx-6 sm:flex sm:justify-end sm:px-6">
            <button type="button" className="btn-secondary" onClick={resetForm}>Отмена</button>
            <button type="button" className="btn-primary" onClick={submit} disabled={loading}>
              {loading ? 'Сохраняем...' : editingId ? 'Сохранить' : 'Создать'}
            </button>
          </div>
        </div>
      </AdminModal>

      {filteredPromoCodes.length > 0 && (
        <div data-testid="admin-promo-grid" className="admin-list">
          <div className="admin-list-header grid-cols-[1.25rem_minmax(0,1fr)_2.5rem] gap-3">
            <span className="sr-only">Выбор</span>
            <div className="grid grid-cols-[minmax(12rem,1fr)_6rem_minmax(18rem,1.5fr)_minmax(12rem,1fr)] items-center gap-x-4">
              <span>Промокод</span>
              <span>Скидка</span>
              <span>Условия</span>
              <span>Владелец</span>
            </div>
            <span className="sr-only">Действия</span>
          </div>
          {filteredPromoCodes.map((promoCode) => {
            const status = promoStatus(promoCode)
            return (
              <article
                key={promoCode.id}
                data-testid="admin-promo-card"
                className={cn(
                  'admin-list-row flex min-w-0 items-start gap-3 px-3.5 py-3.5 sm:px-4',
                  selectedIds.includes(promoCode.id) && 'bg-cyan-50/50 dark:bg-cyan-400/[0.04]'
                )}
              >
                <input
                  className="mt-2 shrink-0"
                  type="checkbox"
                  checked={selectedIds.includes(promoCode.id)}
                  onChange={() => toggleSelected(promoCode.id)}
                  aria-label={`Выбрать промокод ${promoCode.code}`}
                />

                <div className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-3 sm:grid-cols-[minmax(10rem,1fr)_6rem] sm:gap-x-4 lg:grid-cols-[minmax(12rem,1fr)_6rem_minmax(18rem,1.5fr)_minmax(12rem,1fr)] lg:items-center">
                  <div className="min-w-0">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <h3 className="truncate font-mono text-sm font-semibold" title={promoCode.code}>{promoCode.code}</h3>
                      <span className={status === 'AVAILABLE' ? 'badge-active' : status === 'USED' ? 'badge-disabled' : 'badge-limited'}>
                        {status === 'AVAILABLE' ? 'Активен' : status === 'USED' ? 'Использован' : 'Архив'}
                      </span>
                    </div>
                    <div className="mt-1 truncate text-xs text-slate-400">{originTitle(promoCode.origin)}</div>
                  </div>

                  <div className="text-right text-xl font-semibold tracking-tight text-emerald-600 dark:text-emerald-300 sm:text-left">
                    -{promoCode.discountPercent}%
                  </div>

                  <div className="col-span-2 min-w-0 rounded-2xl bg-slate-50 p-3 dark:bg-white/[0.035] lg:col-span-1 lg:rounded-none lg:bg-transparent lg:p-0 lg:dark:bg-transparent">
                    <div className="break-words text-sm font-medium text-slate-700 dark:text-slate-200 lg:truncate" title={promoCode.planNames.join(', ')}>
                      {promoCode.planNames.length > 0 ? promoCode.planNames.join(', ') : 'Все тарифы'}
                    </div>
                    <div className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500 lg:block lg:truncate" title={audienceTitle(promoCode)}>
                      {audienceTitle(promoCode)} · {formatRange(promoCode.startsAt, promoCode.expiresAt)}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] text-slate-500">
                      <span className="rounded-full bg-white px-2 py-1 ring-1 ring-slate-200 dark:bg-white/[0.04] dark:ring-white/10">
                        Использовано {promoCode.usedCount}/{promoCode.maxUses ?? '∞'}
                      </span>
                      {promoCode.reservedCount > promoCode.usedCount && (
                        <span className="rounded-full bg-white px-2 py-1 ring-1 ring-slate-200 dark:bg-white/[0.04] dark:ring-white/10">
                          В резерве {promoCode.reservedCount - promoCode.usedCount}
                        </span>
                      )}
                      <span className="rounded-full bg-white px-2 py-1 ring-1 ring-slate-200 dark:bg-white/[0.04] dark:ring-white/10">
                        На одного {promoCode.maxUsesPerUser}
                      </span>
                    </div>
                  </div>

                  <div className="col-span-2 min-w-0 lg:col-span-1">
                    {promoCode.assignees.length > 0 ? (
                      <AssigneesBlock assignees={promoCode.assignees} />
                    ) : (
                      <span className="text-xs text-slate-400">Без владельца</span>
                    )}
                  </div>
                </div>

                <AdminActionsMenu compact label={`Действия: ${promoCode.code}`}>
                  <PromoActions
                    promoCode={promoCode}
                    onEdit={() => startEdit(promoCode)}
                    onToggle={() => void toggleActive(promoCode)}
                    onDelete={() => void deletePromoCode(promoCode)}
                  />
                </AdminActionsMenu>
              </article>
            )
          })}
        </div>
      )}

      {filteredPromoCodes.length === 0 && (
        <AdminEmptyState
          title={query.trim() ? 'Промокоды не найдены' : 'В разделе пока пусто'}
          description={query.trim() ? 'Измените запрос или очистите поиск.' : 'Создайте промокод или выберите другой статус.'}
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

function PromoActions({
  promoCode,
  onEdit,
  onToggle,
  onDelete,
}: {
  promoCode: PromoCodeAdminRow
  onEdit: () => void
  onToggle: () => void
  onDelete: () => void
}) {
  return (
    <>
      <button type="button" className="btn-secondary min-h-10 px-3 py-2 text-xs" onClick={onEdit} aria-label={`Изменить промокод ${promoCode.code}`}>
        <Edit3 className="h-4 w-4" />
        Изменить
      </button>
      <button
        type="button"
        className={cn('btn-secondary min-h-10 px-3 py-2 text-xs', promoCode.isActive ? 'text-amber-700 dark:text-amber-200' : 'text-emerald-700 dark:text-emerald-200')}
        onClick={onToggle}
        aria-label={`${promoCode.isActive ? 'Отключить' : 'Включить'} промокод ${promoCode.code}`}
      >
        <Power className="h-4 w-4" />
        {promoCode.isActive ? 'Отключить' : 'Включить'}
      </button>
      <button
        type="button"
        className="btn-secondary min-h-10 px-3 py-2 text-xs text-red-600 hover:border-red-200 hover:bg-red-50 hover:text-red-700 dark:text-red-300 dark:hover:border-red-500/30 dark:hover:bg-red-500/10"
        onClick={onDelete}
        aria-label={`Удалить промокод ${promoCode.code}`}
      >
        <Trash2 className="h-4 w-4" />
        Удалить
      </button>
    </>
  )
}

function AssigneesBlock({ assignees }: { assignees: PromoCodeAssignee[] }) {
  const firstAssignee = assignees[0]
  const hiddenCount = Math.max(0, assignees.length - 1)

  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1.5 text-xs text-slate-400">
        <UserRound className="h-3.5 w-3.5" />
        Владелец
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
            {firstAssignee.name ? firstAssignee.email : firstAssignee.sourceLabel}
          </div>
        </div>
      ) : (
        <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">Не закреплён за пользователем</div>
      )}
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
      <span className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-200">{label}</span>
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
