'use client'

import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { Edit3, Power, X } from 'lucide-react'
import { apiFetch } from '@/lib/api-client'
import { toast } from '@/components/ui/toaster'
import { cn } from '@/lib/cn'

export interface PromoCodeAdminRow {
  id: string
  code: string
  discountPercent: number
  isActive: boolean
  startsAt: string | null
  expiresAt: string | null
  maxUses: number | null
  maxUsesPerUser: number
  usedCount: number
  reservedCount: number
  planIds: string[]
  planNames: string[]
}

export interface PromoPlanOption {
  id: string
  name: string
}

interface PromoCodeFormState {
  code: string
  discountPercent: string
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
}: {
  promoCodes: PromoCodeAdminRow[]
  plans: PromoPlanOption[]
}) {
  const router = useRouter()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<PromoCodeFormState>(emptyForm)
  const [loading, setLoading] = useState(false)

  const editingPromo = useMemo(
    () => promoCodes.find((promoCode) => promoCode.id === editingId) ?? null,
    [editingId, promoCodes]
  )

  async function submit() {
    setLoading(true)
    try {
      await apiFetch(editingId ? `/api/admin/promo-codes/${editingId}` : '/api/admin/promo-codes', {
        method: editingId ? 'PATCH' : 'POST',
        body: JSON.stringify({
          code: form.code,
          discountPercent: Number(form.discountPercent),
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

  function startEdit(promoCode: PromoCodeAdminRow) {
    setEditingId(promoCode.id)
    setForm({
      code: promoCode.code,
      discountPercent: String(promoCode.discountPercent),
      isActive: promoCode.isActive,
      startsAt: toLocalDateTime(promoCode.startsAt),
      expiresAt: toLocalDateTime(promoCode.expiresAt),
      maxUses: promoCode.maxUses == null ? '' : String(promoCode.maxUses),
      maxUsesPerUser: String(promoCode.maxUsesPerUser),
      planIds: promoCode.planIds,
    })
  }

  function resetForm() {
    setEditingId(null)
    setForm(emptyForm)
  }

  function togglePlan(planId: string) {
    setForm((current) => ({
      ...current,
      planIds: current.planIds.includes(planId)
        ? current.planIds.filter((id) => id !== planId)
        : [...current.planIds, planId],
    }))
  }

  return (
    <div className="space-y-6">
      <div className="card space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">
              {editingPromo ? `Редактировать ${editingPromo.code}` : 'Новый промокод'}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Пустой список тарифов означает, что промокод действует на все активные тарифы.
            </p>
          </div>
          {editingId && (
            <button type="button" className="btn-secondary text-xs" onClick={resetForm}>
              <X className="h-4 w-4" />
              Отмена
            </button>
          )}
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
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
          <label className="flex items-center gap-2 rounded-lg border px-3 py-3 text-sm xl:col-span-2">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(event) => setForm((current) => ({ ...current, isActive: event.target.checked }))}
            />
            Активен
          </label>
        </div>

        <div>
          <div className="mb-2 text-sm font-medium">Тарифы</div>
          <div className="flex flex-wrap gap-2">
            {plans.map((plan) => (
              <button
                key={plan.id}
                type="button"
                onClick={() => togglePlan(plan.id)}
                className={cn(
                  'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                  form.planIds.includes(plan.id)
                    ? 'border-brand-300 bg-brand-50 text-brand-700 dark:border-brand-500/60 dark:bg-brand-500/10 dark:text-brand-200'
                    : 'bg-white text-slate-600 hover:bg-slate-50 dark:bg-surface-900 dark:text-slate-300 dark:hover:bg-surface-800'
                )}
              >
                {plan.name}
              </button>
            ))}
          </div>
        </div>

        <button type="button" className="btn-primary" onClick={submit} disabled={loading}>
          {loading ? 'Сохраняем...' : editingId ? 'Сохранить изменения' : 'Создать промокод'}
        </button>
      </div>

      <div className="grid gap-3">
        {promoCodes.map((promoCode) => (
          <article key={promoCode.id} className="card">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div className="min-w-0 xl:max-w-xs">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="break-all font-mono text-lg font-semibold">{promoCode.code}</span>
                  <span className={promoCode.isActive ? 'badge-active' : 'badge-disabled'}>
                    {promoCode.isActive ? 'Активен' : 'Отключён'}
                  </span>
                  <span className="badge-limited">-{promoCode.discountPercent}%</span>
                </div>
                <div className="mt-2 break-words text-sm text-slate-500">
                  {promoCode.planNames.length > 0 ? promoCode.planNames.join(', ') : 'Все тарифы'}
                </div>
              </div>

              <div className="grid min-w-0 gap-3 text-sm sm:grid-cols-2 xl:flex-1 2xl:grid-cols-4">
                <Metric label="Использовано" value={`${promoCode.usedCount}/${promoCode.maxUses ?? '∞'}`} />
                <Metric label="Зарезервировано" value={promoCode.reservedCount} />
                <Metric label="На пользователя" value={promoCode.maxUsesPerUser} />
                <Metric label="Срок" value={formatRange(promoCode.startsAt, promoCode.expiresAt)} />
              </div>

              <div className="action-row xl:w-[240px]">
                <button type="button" className="btn-secondary min-w-[112px] px-3 text-xs" onClick={() => startEdit(promoCode)}>
                  <Edit3 className="h-3.5 w-3.5" />
                  Изменить
                </button>
                <button type="button" className="btn-secondary min-w-[112px] px-3 text-xs" onClick={() => toggleActive(promoCode)}>
                  <Power className="h-3.5 w-3.5" />
                  {promoCode.isActive ? 'Отключить' : 'Включить'}
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
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

function Metric({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="info-cell">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 truncate font-medium">{value}</div>
    </div>
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
