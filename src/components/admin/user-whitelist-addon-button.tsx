'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Globe2, Loader2, Save, Trash2 } from 'lucide-react'
import { AdminModal } from '@/components/admin/admin-modal'
import { apiFetch } from '@/lib/api-client'
import { toast } from '@/components/ui/toaster'

export function UserWhitelistAddonButton({
  userId,
  email,
  active: initialActive,
  expireAt,
  available = true,
  showLabel = false,
}: {
  userId: string
  email: string
  active: boolean
  expireAt: string | null
  available?: boolean
  showLabel?: boolean
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [active, setActive] = useState(initialActive)
  const [expiresOn, setExpiresOn] = useState(() => expireAt?.slice(0, 10) ?? defaultExpiryDate())

  async function grant(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(true)
    try {
      await apiFetch(`/api/admin/users/${userId}/whitelist-addon`, {
        method: 'PUT',
        body: JSON.stringify({ expiresOn }),
      })
      setActive(true)
      toast(`БС выданы до ${formatDate(expiresOn)}`, 'success')
      router.refresh()
    } finally {
      setLoading(false)
    }
  }

  async function revoke() {
    setLoading(true)
    try {
      await apiFetch(`/api/admin/users/${userId}/whitelist-addon`, { method: 'DELETE' })
      setActive(false)
      toast('Доступ к БС снят', 'success')
      router.refresh()
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <button
        type="button"
        className={`btn-secondary h-10 min-h-10 shrink-0 hover:text-violet-700 dark:hover:text-violet-300 ${showLabel ? 'px-3' : 'w-10 px-0'}`}
        onClick={() => setOpen(true)}
        title="Управление БС"
        aria-label="Управление БС"
      >
        <Globe2 className="h-4 w-4" />
        {showLabel ? <span>{available ? 'Управление БС' : 'БС: нужна подписка'}</span> : null}
      </button>

      <AdminModal
        open={open}
        onClose={() => !loading && setOpen(false)}
        title="Ручная выдача БС"
        description={email}
        size="md"
      >
        {!available ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-400/20 dark:bg-amber-400/[0.08] dark:text-amber-100">
            У пользователя нет действующей подписки. Сначала назначьте тариф, после этого здесь можно будет выдать БС до выбранной даты.
          </div>
        ) : (
          <form className="space-y-5" onSubmit={grant}>
            <div className={`rounded-xl border p-3 text-sm ${active
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-400/20 dark:bg-emerald-400/[0.06] dark:text-emerald-200'
              : 'border-slate-200 bg-slate-50 text-slate-600 dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-300'
            }`}>
              {active ? `БС подключены до ${formatDate(expiresOn)}` : 'БС не подключены'}
            </div>

            <label className="block">
              <span className="label">Выдать до конца дня</span>
              <input
                type="date"
                className="input"
                min={todayDate()}
                value={expiresOn}
                disabled={loading}
                onChange={(event) => setExpiresOn(event.target.value)}
                required
              />
              <span className="mt-1.5 block text-xs text-slate-500">
                Серверные группы берутся из настроек БС текущего тарифа. После этой даты доступ снимется автоматически.
              </span>
            </label>

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
              <div>
                {active ? (
                  <button type="button" className="btn-secondary text-red-600 dark:text-red-300" disabled={loading} onClick={() => void revoke()}>
                    <Trash2 className="h-4 w-4" />
                    Снять БС
                  </button>
                ) : null}
              </div>
              <button type="submit" className="btn-primary" disabled={loading || !expiresOn}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {active ? 'Изменить дату' : 'Выдать БС'}
              </button>
            </div>
          </form>
        )}
      </AdminModal>
    </>
  )
}

function todayDate() {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Moscow' }).format(new Date())
}

function defaultExpiryDate() {
  const date = new Date()
  date.setUTCDate(date.getUTCDate() + 30)
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Moscow' }).format(date)
}

function formatDate(value: string) {
  const [year, month, day] = value.split('-')
  return `${day}.${month}.${year}`
}
