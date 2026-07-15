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
  telegramId,
  telegramUsername,
  remnashopUserId,
  remnawaveUuid,
  remnawaveShortUuid,
  remnawaveUsername,
}: {
  userId: string
  email: string
  name: string | null
  emailVerified: boolean
  telegramId?: string | null
  telegramUsername?: string | null
  remnashopUserId?: number | null
  remnawaveUuid?: string | null
  remnawaveShortUuid?: string | null
  remnawaveUsername?: string | null
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    email,
    name: name ?? '',
    emailVerified,
    telegramId: telegramId ?? '',
    telegramUsername: telegramUsername ?? '',
    remnashopUserId: remnashopUserId ? String(remnashopUserId) : '',
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
        body: JSON.stringify({
          email: form.email,
          name: form.name,
          emailVerified: form.emailVerified,
          telegramId: form.telegramId,
          telegramUsername: form.telegramUsername,
          remnashopUserId: form.remnashopUserId,
        }),
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
        className="btn-secondary h-9 min-h-9 w-9 shrink-0 px-0 hover:text-cyan-700 dark:hover:text-cyan-200"
        onClick={() => setOpen(true)}
        title="Редактировать профиль"
        aria-label="Редактировать профиль"
      >
        <Pencil className="h-4 w-4" />
      </button>

      <AdminModal
        open={open}
        onClose={close}
        title="Профиль пользователя"
        description="Эти данные используются при поиске и синхронизации аккаунта."
        size="xl"
      >
        <form onSubmit={submit} className="space-y-5">
          <div className="grid gap-4 md:grid-cols-2">
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
          </div>

          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-white/10 dark:bg-white/[0.03]">
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

          <section className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50/40 p-4 dark:border-white/10 dark:bg-white/[0.02]">
            <div>
              <h3 className="font-semibold">Связанные аккаунты</h3>
              <p className="mt-1 text-sm text-slate-500">Заполняйте вручную, если нужно связать профиль после импорта или ошибки синхронизации.</p>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <label className="block">
                <span className="label">Telegram ID</span>
                <input
                  className="input"
                  inputMode="numeric"
                  value={form.telegramId}
                  onChange={(event) => setForm((current) => ({ ...current, telegramId: event.target.value.replace(/\D/g, '') }))}
                  placeholder="8507156675"
                />
              </label>
              <label className="block">
                <span className="label">Telegram username</span>
                <input
                  className="input"
                  value={form.telegramUsername}
                  onChange={(event) => setForm((current) => ({ ...current, telegramUsername: event.target.value.replace(/^@/, '') }))}
                  placeholder="username"
                />
              </label>
              <label className="block">
                <span className="label">Remnashop ID</span>
                <input
                  className="input"
                  inputMode="numeric"
                  value={form.remnashopUserId}
                  onChange={(event) => setForm((current) => ({ ...current, remnashopUserId: event.target.value.replace(/\D/g, '') }))}
                  placeholder="42"
                />
              </label>
            </div>
          </section>

          <section className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50/40 p-4 dark:border-white/10 dark:bg-white/[0.02]">
            <div>
              <h3 className="font-semibold">Remnawave</h3>
              <p className="mt-1 text-sm text-slate-500">Эти данные выдаются автоматически и не редактируются вручную.</p>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <ReadonlyIdentity label="Username" value={remnawaveUsername} />
              <ReadonlyIdentity label="UUID" value={remnawaveUuid} />
              <ReadonlyIdentity label="Short UUID" value={remnawaveShortUuid} />
            </div>
          </section>

          <div className="grid grid-cols-2 gap-2 border-t pt-4 sm:flex sm:justify-end">
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

function ReadonlyIdentity({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 dark:border-white/10 dark:bg-white/[0.03]">
      <div className="text-xs font-medium uppercase text-slate-400">{label}</div>
      <div className="mt-1 break-all font-mono text-sm text-slate-700 dark:text-slate-200">{value || '—'}</div>
    </div>
  )
}
