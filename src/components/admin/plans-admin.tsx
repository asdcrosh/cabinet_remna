'use client'

import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { Edit3, Power, X } from 'lucide-react'
import { apiFetch } from '@/lib/api-client'
import { formatPrice } from '@/lib/format'
import { toast } from '@/components/ui/toaster'
import { cn } from '@/lib/cn'

export interface PlanAdminRow {
  id: string
  name: string
  description: string | null
  priceKopecks: number
  durationDays: number
  trafficLimitGb: number | null
  deviceLimit: number
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
  sortOrder: string
  isPromo: boolean
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
  sortOrder: '10',
  isPromo: false,
  isActive: true,
}

export function PlansAdmin({ plans }: { plans: PlanAdminRow[] }) {
  const router = useRouter()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<PlanFormState>(emptyForm)
  const [loading, setLoading] = useState(false)

  const editingPlan = useMemo(
    () => plans.find((plan) => plan.id === editingId) ?? null,
    [editingId, plans]
  )

  async function submit() {
    setLoading(true)
    try {
      await apiFetch(editingId ? `/api/admin/plans/${editingId}` : '/api/admin/plans', {
        method: editingId ? 'PATCH' : 'POST',
        body: JSON.stringify(toPayload(form)),
      })
      toast(editingId ? 'Тариф обновлён' : 'Тариф создан', 'success')
      resetForm()
      router.refresh()
    } catch {
      // apiFetch уже покажет toast
    } finally {
      setLoading(false)
    }
  }

  async function toggleActive(plan: PlanAdminRow) {
    try {
      await apiFetch(`/api/admin/plans/${plan.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: !plan.isActive }),
      })
      toast(plan.isActive ? 'Тариф скрыт' : 'Тариф опубликован', 'success')
      router.refresh()
    } catch {
      // apiFetch уже покажет toast
    }
  }

  function startEdit(plan: PlanAdminRow) {
    setEditingId(plan.id)
    setForm({
      name: plan.name,
      description: plan.description ?? '',
      priceRub: String(plan.priceKopecks / 100),
      durationDays: String(plan.durationDays),
      trafficLimitGb: plan.trafficLimitGb == null ? '' : String(plan.trafficLimitGb),
      unlimitedTraffic: plan.trafficLimitGb == null,
      deviceLimit: String(plan.deviceLimit),
      sortOrder: String(plan.sortOrder),
      isPromo: plan.isPromo,
      isActive: plan.isActive,
    })
  }

  function resetForm() {
    setEditingId(null)
    setForm(emptyForm)
  }

  return (
    <div className="space-y-6">
      <div className="card space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold">
              {editingPlan ? `Редактировать ${editingPlan.name}` : 'Новый тариф'}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Активные тарифы показываются пользователям на странице покупки.
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
          <Field label="Название">
            <input
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              className="input"
              placeholder="Базовый"
            />
          </Field>
          <Field label="Цена, ₽">
            <input
              value={form.priceRub}
              onChange={(event) => setForm((current) => ({ ...current, priceRub: event.target.value }))}
              className="input"
              type="number"
              min={0}
              step="0.01"
            />
          </Field>
          <Field label="Срок, дней">
            <input
              value={form.durationDays}
              onChange={(event) => setForm((current) => ({ ...current, durationDays: event.target.value }))}
              className="input"
              type="number"
              min={1}
            />
          </Field>
          <Field label="Устройств">
            <input
              value={form.deviceLimit}
              onChange={(event) => setForm((current) => ({ ...current, deviceLimit: event.target.value }))}
              className="input"
              type="number"
              min={1}
            />
          </Field>
          <Field label="Трафик, ГБ">
            <input
              value={form.trafficLimitGb}
              onChange={(event) => setForm((current) => ({ ...current, trafficLimitGb: event.target.value }))}
              className="input"
              type="number"
              min={1}
              disabled={form.unlimitedTraffic}
              placeholder="Безлимит"
            />
          </Field>
          <Field label="Порядок">
            <input
              value={form.sortOrder}
              onChange={(event) => setForm((current) => ({ ...current, sortOrder: event.target.value }))}
              className="input"
              type="number"
              min={0}
            />
          </Field>
          <label className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-3 text-sm dark:border-white/10">
            <input
              type="checkbox"
              checked={form.unlimitedTraffic}
              onChange={(event) => setForm((current) => ({ ...current, unlimitedTraffic: event.target.checked }))}
            />
            Безлимитный трафик
          </label>
          <label className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-3 text-sm dark:border-white/10">
            <input
              type="checkbox"
              checked={form.isPromo}
              onChange={(event) => setForm((current) => ({ ...current, isPromo: event.target.checked }))}
            />
            Промо-тариф
          </label>
          <label className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-3 text-sm dark:border-white/10">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(event) => setForm((current) => ({ ...current, isActive: event.target.checked }))}
            />
            Опубликован
          </label>
          <Field label="Описание" className="md:col-span-2 xl:col-span-4">
            <textarea
              value={form.description}
              onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
              className="input min-h-[92px] resize-y"
              placeholder="Коротко для карточки тарифа"
            />
          </Field>
        </div>

        <button type="button" className="btn-primary" onClick={submit} disabled={loading}>
          {loading ? 'Сохраняем...' : editingId ? 'Сохранить изменения' : 'Создать тариф'}
        </button>
      </div>

      <div className="grid gap-3">
        {plans.length === 0 && (
          <div className="card py-10 text-center text-sm text-slate-500">
            Тарифов пока нет. Создайте первый тариф выше.
          </div>
        )}
        {plans.map((plan) => (
          <article key={plan.id} className="card">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div className="min-w-0 xl:max-w-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="break-words text-lg font-semibold">{plan.name}</span>
                  <span className={plan.isActive ? 'badge-active' : 'badge-disabled'}>
                    {plan.isActive ? 'Опубликован' : 'Скрыт'}
                  </span>
                  {plan.isPromo && <span className="badge-limited">Промо</span>}
                  <span className="badge-limited">{formatPrice(plan.priceKopecks)}</span>
                </div>
                {plan.description && (
                  <div className="mt-2 break-words text-sm text-slate-500">{plan.description}</div>
                )}
              </div>

              <div className="grid min-w-0 gap-3 text-sm sm:grid-cols-2 xl:flex-1 2xl:grid-cols-5">
                <Metric label="Срок" value={`${plan.durationDays} дн.`} />
                <Metric label="Трафик" value={plan.trafficLimitGb == null ? 'Безлимит' : `${plan.trafficLimitGb} ГБ`} />
                <Metric label="Устройства" value={plan.deviceLimit} />
                <Metric label="Порядок" value={plan.sortOrder} />
                <Metric label="Связи" value={`${plan.subscriptionsCount} / ${plan.paymentsCount}`} />
              </div>

              <div className="action-row xl:w-[240px]">
                <button type="button" className="btn-secondary min-w-[112px] px-3 text-xs" onClick={() => startEdit(plan)}>
                  <Edit3 className="h-3.5 w-3.5" />
                  Изменить
                </button>
                <button type="button" className="btn-secondary min-w-[112px] px-3 text-xs" onClick={() => toggleActive(plan)}>
                  <Power className="h-3.5 w-3.5" />
                  {plan.isActive ? 'Скрыть' : 'Показать'}
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  )
}

function Field({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={cn('block', className)}>
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

function toPayload(form: PlanFormState) {
  return {
    name: form.name,
    description: form.description || null,
    priceKopecks: Math.round(Number(form.priceRub) * 100),
    durationDays: Number(form.durationDays),
    trafficLimitGb: form.unlimitedTraffic || !form.trafficLimitGb ? null : Number(form.trafficLimitGb),
    deviceLimit: Number(form.deviceLimit),
    sortOrder: Number(form.sortOrder),
    isPromo: form.isPromo,
    isActive: form.isActive,
  }
}
