'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, Save } from 'lucide-react'
import { AdminModal } from '@/components/admin/admin-modal'
import { toast } from '@/components/ui/toaster'
import { apiFetch } from '@/lib/api-client'

export function UserProfileEditButton({
  userId,
  email,
  name,
  emailVerified,
}: {
  userId: string
  email: string
  name: string | null
  emailVerified: boolean
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    email,
    name: name ?? '',
    emailVerified,
  })

  function close() {
    if (!loading) setOpen(false)
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(true)
    try {
      const result = await apiFetch<{ syncDeferred?: boolean }>(`/api/admin/users/${userId}/profile`, {
        method: 'PATCH',
        body: JSON.stringify(form),
      })
      toast(
        result.syncDeferred
          ? 'Профиль сохранён. Внешняя синхронизация повторится позже'
          : 'Профиль пользователя обновлён',
        'success'
      )
      setOpen(false)
      router.refresh()
    } catch {
      // apiFetch показывает ошибку.
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <button
        type="button"
        className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-600 shadow-sm transition-colors hover:border-cyan-200 hover:bg-cyan-50 hover:text-cyan-700 dark:border-white/10 dark:bg-surface-900 dark:text-slate-200 dark:hover:bg-cyan-500/10 dark:hover:text-cyan-200"
        onClick={() => setOpen(true)}
        title="Редактировать профиль"
        aria-label="Редактировать профиль"
      >
        <Pencil className="h-4 w-4" />
        <span className="hidden sm:inline">Профиль</span>
      </button>

      <AdminModal
        open={open}
        onClose={close}
        title="Профиль пользователя"
        description="Эти данные используются при поиске и синхронизации аккаунта."
        size="md"
      >
        <form onSubmit={submit} className="space-y-5">
          <label className="block">
            <span className="label">Email</span>
            <input
              className="input"
              type="email"
              value={form.email}
              onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
              maxLength={255}
              required
              autoFocus
            />
          </label>

          <label className="block">
            <span className="label">Имя</span>
            <input
              className="input"
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              maxLength={40}
              placeholder="Имя пользователя"
            />
          </label>

          <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-white/10 dark:bg-white/[0.03]">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 rounded border-slate-300"
              checked={form.emailVerified}
              onChange={(event) => setForm((current) => ({ ...current, emailVerified: event.target.checked }))}
            />
            <span>
              <span className="block text-sm font-medium">Email подтверждён</span>
              <span className="mt-0.5 block text-xs leading-5 text-slate-500">
                Включайте только если адрес проверен. После сохранения он будет использован для связи с Remnashop.
              </span>
            </span>
          </label>

          <div className="flex justify-end gap-2 border-t pt-4">
            <button type="button" className="btn-secondary" onClick={close} disabled={loading}>
              Отмена
            </button>
            <button type="submit" className="btn-primary" disabled={loading}>
              <Save className="h-4 w-4" />
              {loading ? 'Сохраняем...' : 'Сохранить'}
            </button>
          </div>
        </form>
      </AdminModal>
    </>
  )
}
