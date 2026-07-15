'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarPlus, Search, Save } from 'lucide-react'
import { AdminModal } from '@/components/admin/admin-modal'
import { apiFetch } from '@/lib/api-client'
import { toast } from '@/components/ui/toaster'
import { formatPrice } from '@/lib/format'

export interface UserPlanOption {
  id: string
  name: string
  priceKopecks: number
  durationDays: number
  isActive: boolean
}

export function UserPlanButton({
  userId,
  email,
  currentPlanId,
  plans,
}: {
  userId: string
  email: string
  currentPlanId: string | null
  plans: UserPlanOption[]
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [planId, setPlanId] = useState(currentPlanId ?? plans[0]?.id ?? '')
  const [mode, setMode] = useState<'REPLACE' | 'EXTEND'>('REPLACE')
  const [loading, setLoading] = useState(false)
  const [query, setQuery] = useState('')
  const filteredPlans = plans.filter((plan) =>
    `${plan.name} ${plan.durationDays} ${formatPrice(plan.priceKopecks)}`
      .toLowerCase()
      .includes(query.trim().toLowerCase())
  )

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!planId) return
    setLoading(true)
    try {
      await apiFetch(`/api/admin/users/${userId}/plan`, {
        method: 'POST',
        body: JSON.stringify({ planId, mode }),
      })
      toast(mode === 'REPLACE' ? 'Тариф назначен, новый период начат' : 'Тариф начислен к текущему сроку', 'success')
      setOpen(false)
      router.refresh()
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <button
        type="button"
        className="btn-secondary h-9 min-h-9 w-9 shrink-0 px-0 hover:text-emerald-700 dark:hover:text-emerald-300"
        onClick={() => setOpen(true)}
        title="Назначить тариф"
        aria-label="Назначить тариф"
      >
        <CalendarPlus className="h-4 w-4" />
      </button>

      <AdminModal
        open={open}
        onClose={() => !loading && setOpen(false)}
        title="Назначить тариф"
        description={email}
        size="md"
      >
        <form onSubmit={submit} className="space-y-5">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              className="input pl-9"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Найти тариф"
            />
          </div>

          <div className="grid max-h-[18rem] gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
            {filteredPlans.map((plan) => (
              <label
                key={plan.id}
                className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors hover:bg-slate-50 dark:hover:bg-white/5 ${
                  planId === plan.id ? 'border-slate-950 bg-slate-50 dark:border-white dark:bg-white/5' : ''
                }`}
              >
                <input type="radio" name="plan" checked={planId === plan.id} onChange={() => setPlanId(plan.id)} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{plan.name}</span>
                  <span className="text-xs text-slate-500">
                    {plan.durationDays} дней · {formatPrice(plan.priceKopecks)}{!plan.isActive ? ' · скрыт' : ''}
                  </span>
                </span>
              </label>
            ))}
            {filteredPlans.length === 0 && (
              <div className="rounded-xl border border-dashed px-3 py-8 text-center text-sm text-slate-500 sm:col-span-2">
                Тарифы не найдены
              </div>
            )}
          </div>

          <div className="grid gap-2 rounded-xl bg-slate-50 p-1 dark:bg-white/5 sm:grid-cols-2">
            <button type="button" className={mode === 'REPLACE' ? 'btn-primary' : 'btn-secondary'} onClick={() => setMode('REPLACE')}>
              Выдать заново
            </button>
            <button type="button" className={mode === 'EXTEND' ? 'btn-primary' : 'btn-secondary'} onClick={() => setMode('EXTEND')}>
              Добавить дни
            </button>
          </div>
          <p className="text-sm text-slate-500">
            {mode === 'REPLACE'
              ? 'Текущая подписка заменится выбранным тарифом с сегодняшней даты.'
              : 'Срок выбранного тарифа добавится к текущей подписке.'}
          </p>

          <div className="grid grid-cols-2 gap-2 border-t pt-4 sm:flex sm:justify-end">
            <button type="button" className="btn-secondary" onClick={() => setOpen(false)} disabled={loading}>Отмена</button>
            <button type="submit" className="btn-primary" disabled={loading || !planId}>
              <Save className="h-4 w-4" />
              {loading ? 'Применяем...' : 'Назначить'}
            </button>
          </div>
        </form>
      </AdminModal>
    </>
  )
}
