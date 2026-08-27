'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, Save } from 'lucide-react'
import { AdminModal } from '@/components/admin/admin-modal'
import { toast } from '@/components/ui/toaster'
import { apiFetch } from '@/lib/api-client'
import { FormAlert } from '@/components/ui/form-alert'
import { Switch } from '@/components/ui/switch'

export function UserProfileEditButton({
  userId,
  email,
  name,
  emailVerified,
  telegramId,
  telegramUsername,
  remnashopUserId,
  remnawaveId,
  remnawaveUuid,
  remnawaveShortUuid,
  remnawaveUsername,
  personalDiscountPercent = 0,
  nextPurchaseDiscountPercent = 0,
  canManageDiscounts = false,
  showLabel = false,
}: {
  userId: string
  email: string
  name: string | null
  emailVerified: boolean
  telegramId?: string | null
  telegramUsername?: string | null
  remnashopUserId?: number | null
  remnawaveId?: number | null
  remnawaveUuid?: string | null
  remnawaveShortUuid?: string | null
  remnawaveUsername?: string | null
  personalDiscountPercent?: number
  nextPurchaseDiscountPercent?: number
  canManageDiscounts?: boolean
  showLabel?: boolean
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const [form, setForm] = useState({
    email,
    name: name ?? '',
    emailVerified,
    telegramId: telegramId ?? '',
    telegramUsername: telegramUsername ?? '',
    remnashopUserId: remnashopUserId ? String(remnashopUserId) : '',
    personalDiscountPercent: String(personalDiscountPercent),
    nextPurchaseDiscountPercent: String(nextPurchaseDiscountPercent),
  })

  function close() {
    if (!loading) setOpen(false)
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setServerError(null)
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
          ...(canManageDiscounts
            ? {
                personalDiscountPercent: Number(form.personalDiscountPercent),
                nextPurchaseDiscountPercent: Number(form.nextPurchaseDiscountPercent),
              }
            : {}),
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
    } catch (error) {
      setServerError(error instanceof Error ? error.message : 'Не удалось сохранить профиль')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <button
        type="button"
        className={`btn-secondary h-10 min-h-10 shrink-0 hover:text-cyan-700 dark:hover:text-cyan-200 ${showLabel ? 'px-3' : 'w-10 px-0'}`}
        onClick={() => setOpen(true)}
        title="Редактировать профиль"
        aria-label="Редактировать профиль"
      >
        <Pencil className="h-4 w-4" />
        {showLabel ? <span>Редактировать профиль</span> : null}
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

          <Switch
            checked={form.emailVerified}
            onCheckedChange={(checked) => setForm((current) => ({ ...current, emailVerified: checked }))}
            label="Email подтверждён"
            description="Включайте только если адрес проверен. После сохранения он будет использован для связи с Remnashop."
            className="border-y border-slate-200/90 py-3 dark:border-white/[0.09]"
          />

          {canManageDiscounts ? (
            <section className="space-y-3 rounded-2xl border border-violet-200 bg-violet-50/45 p-4 dark:border-violet-400/20 dark:bg-violet-400/[0.05]">
              <div>
                <h3 className="font-semibold">Персональные скидки</h3>
                <p className="mt-1 text-sm text-slate-500">Обе скидки действуют только на основную стоимость тарифа, без дополнительных устройств и белых списков. Укажите 0, чтобы отключить.</p>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="block">
                  <span className="label">Персональная скидка, %</span>
                  <input
                    className="input"
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={99}
                    value={form.personalDiscountPercent}
                    onChange={(event) => setForm((current) => ({ ...current, personalDiscountPercent: event.target.value.replace(/\D/g, '') }))}
                  />
                </label>
                <label className="block">
                  <span className="label">На следующую покупку, %</span>
                  <input
                    className="input"
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={99}
                    value={form.nextPurchaseDiscountPercent}
                    onChange={(event) => setForm((current) => ({ ...current, nextPurchaseDiscountPercent: event.target.value.replace(/\D/g, '') }))}
                  />
                </label>
              </div>
            </section>
          ) : null}

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

          {serverError && (
            <FormAlert>{serverError}</FormAlert>
          )}

          <section className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50/40 p-4 dark:border-white/10 dark:bg-white/[0.02]">
            <div>
              <h3 className="font-semibold">Remnawave</h3>
              <p className="mt-1 text-sm text-slate-500">Эти данные выдаются автоматически и не редактируются вручную.</p>
            </div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <ReadonlyIdentity label="ID (v3)" value={remnawaveId ? String(remnawaveId) : null} />
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
