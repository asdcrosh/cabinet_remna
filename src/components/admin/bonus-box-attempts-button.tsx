'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createPortal } from 'react-dom'
import { Gift, Plus, X } from 'lucide-react'
import { apiFetch } from '@/lib/api-client'
import { toast } from '@/components/ui/toaster'

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
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

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

  const dialog = (
    <div className="fixed inset-0 z-50 grid place-items-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-slate-950/50"
        onClick={() => setOpen(false)}
        disabled={loading}
        aria-label="Закрыть окно начисления"
      />
      <div className="relative z-10 w-full max-w-md rounded-lg border bg-white p-5 shadow-2xl dark:border-white/10 dark:bg-surface-900">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-cyan-50 text-cyan-700 dark:bg-cyan-500/10 dark:text-cyan-200">
                <Gift className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <h2 className="font-semibold">Начислить открытия</h2>
                <p className="truncate text-sm text-slate-500">{email}</p>
              </div>
            </div>
          </div>
          <button
            type="button"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/10 dark:hover:text-white"
            onClick={() => setOpen(false)}
            disabled={loading}
            aria-label="Закрыть"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-5 grid gap-4">
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
      </div>
    </div>
  )

  return (
    <>
      <button
        type="button"
        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 shadow-sm shadow-slate-200/50 transition-colors hover:bg-slate-50 dark:border-white/10 dark:bg-surface-900 dark:text-slate-200 dark:shadow-black/10 dark:hover:bg-surface-800"
        onClick={() => setOpen(true)}
        title="Начислить открытия"
      >
        <Gift className="h-3.5 w-3.5" />
        <span className="hidden 2xl:inline">Начислить</span>
        <Plus className="h-3.5 w-3.5" />
      </button>

      {mounted && open ? createPortal(dialog, document.body) : null}
    </>
  )
}
