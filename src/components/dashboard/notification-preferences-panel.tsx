'use client'

import { useState } from 'react'
import { Bell, Loader2, Mail, Megaphone, Send } from 'lucide-react'
import type { NotificationPreferences } from '@/lib/notification-preferences'
import { apiFetch } from '@/lib/api-client'
import { Switch } from '@/components/ui/switch'
import { toast } from '@/components/ui/toaster'
import { useUnsavedChanges } from '@/lib/use-unsaved-changes'

const options: Array<{
  key: keyof NotificationPreferences
  title: string
  description: string
  icon: typeof Bell
}> = [
  { key: 'inAppEnabled', title: 'В кабинете', description: 'Колокольчик и история событий', icon: Bell },
  { key: 'telegramEnabled', title: 'Telegram', description: 'Сообщения в Telegram', icon: Send },
  { key: 'emailEnabled', title: 'Email', description: 'Письма на подтверждённый адрес', icon: Mail },
  { key: 'broadcastsEnabled', title: 'Новости и предложения', description: 'Информация об обновлениях и акциях', icon: Megaphone },
]

export function NotificationPreferencesPanel({
  initialPreferences,
  hasVerifiedEmail,
  hasTelegram,
}: {
  initialPreferences: NotificationPreferences
  hasVerifiedEmail: boolean
  hasTelegram: boolean
}) {
  const [preferences, setPreferences] = useState(initialPreferences)
  const [saved, setSaved] = useState(initialPreferences)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const dirty = options.some(({ key }) => preferences[key] !== saved[key])
  useUnsavedChanges(dirty && !saving)

  async function save() {
    setSaving(true)
    setSaveError(null)
    try {
      const data = await apiFetch<{ preferences: NotificationPreferences }>('/api/notifications/preferences', {
        method: 'PATCH',
        body: JSON.stringify(preferences),
      })
      setPreferences(data.preferences)
      setSaved(data.preferences)
      toast('Настройки уведомлений сохранены', 'success')
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Не удалось сохранить настройки')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <p className="max-w-2xl text-sm leading-6 text-slate-500 dark:text-slate-400">
        Сервисные сообщения о платежах и доступе приходят через выбранные каналы. Новости можно отключить отдельно.
      </p>
      <div className="mt-5 divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 dark:divide-white/10 dark:border-white/10">
        {options.map((option) => {
          const Icon = option.icon
          const enabled = preferences[option.key]
          const unavailable = option.key === 'telegramEnabled' && !hasTelegram
            ? 'Telegram не подключён'
            : option.key === 'emailEnabled' && !hasVerifiedEmail
              ? 'Email не подтверждён'
              : null
          return (
            <div key={option.key} className="flex min-h-[5.5rem] items-center justify-between gap-3 px-4 py-3.5 sm:px-5">
              <div className="flex min-w-0 items-start gap-3">
                <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-600 dark:bg-white/[0.06] dark:text-slate-300">
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-slate-950 dark:text-white">{option.title}</div>
                  <div className="mt-0.5 text-xs leading-5 text-slate-500 dark:text-slate-400">{option.description}</div>
                  {unavailable ? <div className="mt-1 text-xs font-medium text-amber-700 dark:text-amber-300">{unavailable}. Сообщения пока не придут.</div> : null}
                </div>
              </div>
              <Switch
                checked={enabled}
                onCheckedChange={(checked) => setPreferences((current) => ({ ...current, [option.key]: checked }))}
                label={`${enabled ? 'Выключить' : 'Включить'} ${option.title.toLowerCase()}`}
                compact
              />
            </div>
          )
        })}
      </div>
      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs leading-5 text-slate-500 dark:text-slate-400">
          {dirty ? 'Есть несохранённые изменения' : 'Изменения сохранены'} · Бонусы всегда доступны в истории.
        </p>
        <button type="button" className="btn-primary w-full sm:w-auto" disabled={!dirty || saving} onClick={() => void save()}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {saving ? 'Сохраняем...' : 'Сохранить изменения'}
        </button>
      </div>
      {saveError ? <p role="alert" className="mt-2 text-sm text-rose-700 dark:text-rose-300">{saveError}</p> : null}
    </div>
  )
}
