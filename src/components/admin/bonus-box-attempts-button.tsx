'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Gift } from 'lucide-react'
import { apiFetch } from '@/lib/api-client'
import { toast } from '@/components/ui/toaster'
import { AdminModal } from '@/components/admin/admin-modal'

export function BonusBoxAttemptsButton({
  userId,
  email,
  attemptsCount,
}: {
  userId: string
  email: string
  attemptsCount: number
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState('1')
  const [loading, setLoading] = useState(false)

  async function submit() {
    const attemptsToAdd = Number(value)
    if (!Number.isInteger(attemptsToAdd) || attemptsToAdd < 1 || attemptsToAdd > 100) {
      toast('Укажите количество от 1 до 100')
      return
    }

    setLoading(true)
    try {
      await apiFetch(`/api/admin/users/${userId}/bonus-box-attempts`, {
        method: 'POST',
        body: JSON.stringify({ attemptsCount: attemptsToAdd }),
      })
      toast(`Начислено открытий: ${attemptsToAdd}`, 'success')
      setOpen(false)
      setValue('1')
      router.refresh()
    } catch {
      // apiFetch покажет ошибку.
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <button
        type="button"
        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-600 shadow-sm transition-colors hover:border-cyan-200 hover:bg-cyan-50 hover:text-cyan-700 dark:border-white/10 dark:bg-surface-900 dark:text-slate-200 dark:hover:bg-cyan-500/10 dark:hover:text-cyan-200"
        onClick={() => setOpen(true)}
        title="Начислить подарок"
        aria-label="Начислить подарок"
      >
        <Gift className="h-4 w-4" />
      </button>

      <AdminModal
        open={open}
        title="Начислить открытия"
        description={email}
        onClose={() => {
          if (!loading) setOpen(false)
        }}
        size="md"
      >
        <div className="grid gap-4">
          <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-sm dark:border-white/10 dark:bg-surface-800">
            Сейчас доступно: <span className="font-semibold">{attemptsCount}</span>
          </div>
          <label className="block">
            <span className="label">Сколько добавить</span>
            <input
              className="input"
              type="number"
              min={1}
              max={100}
              value={value}
              onChange={(event) => setValue(event.target.value)}
              autoFocus
            />
          </label>
          <p className="text-sm leading-6 text-slate-500">
            Пользователь сможет открыть бокс только при активной VPN-подписке. Срок действия берётся из настроек окружения.
          </p>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={() => setOpen(false)} disabled={loading}>
            Отмена
          </button>
          <button type="button" className="btn-primary" onClick={submit} disabled={loading}>
            {loading ? 'Начисляем...' : 'Начислить'}
          </button>
        </div>
      </AdminModal>
    </>
  )
}
