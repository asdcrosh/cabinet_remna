'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarPlus, Save } from 'lucide-react'
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
        className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-slate-200 bg-white text-slate-600 shadow-sm transition-colors hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700 dark:border-white/10 dark:bg-surface-900"
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
          <div className="space-y-2">
            {plans.map((plan) => (
              <label key={plan.id} className="flex cursor-pointer items-center gap-3 rounded-lg border p-3 hover:bg-slate-50 dark:hover:bg-white/5">
                <input type="radio" name="plan" checked={planId === plan.id} onChange={() => setPlanId(plan.id)} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{plan.name}</span>
                  <span className="text-xs text-slate-500">{plan.durationDays} дней · {formatPrice(plan.priceKopecks)}{!plan.isActive ? ' · скрыт' : ''}</span>
                </span>
              </label>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-2 rounded-lg bg-slate-50 p-1 dark:bg-white/5">
            <button type="button" className={mode === 'REPLACE' ? 'btn-primary' : 'btn-secondary'} onClick={() => setMode('REPLACE')}>
              Новый период
            </button>
            <button type="button" className={mode === 'EXTEND' ? 'btn-primary' : 'btn-secondary'} onClick={() => setMode('EXTEND')}>
              Продлить
            </button>
          </div>
          <p className="text-sm text-slate-500">
            {mode === 'REPLACE'
              ? 'Срок начнётся сегодня, настройки тарифа применятся сразу, текущий трафик будет сброшен.'
              : 'Дни выбранного тарифа добавятся к действующей подписке.'}
          </p>

          <div className="flex justify-end gap-2 border-t pt-4">
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
