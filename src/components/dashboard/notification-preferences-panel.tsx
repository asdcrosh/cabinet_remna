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
  { key: 'inAppEnabled', title: 'В кабинете', description: 'Важные события в колокольчике и истории', icon: Bell },
  { key: 'telegramEnabled', title: 'Telegram', description: 'Срочные события в привязанный аккаунт', icon: Send },
  { key: 'emailEnabled', title: 'Email', description: 'Важные письма на подтверждённый адрес', icon: Mail },
  { key: 'broadcastsEnabled', title: 'Новости и предложения', description: 'Необязательные рассылки по включённым каналам', icon: Megaphone },
]

export function NotificationPreferencesPanel({ initialPreferences }: { initialPreferences: NotificationPreferences }) {
  const [preferences, setPreferences] = useState(initialPreferences)
  const [saved, setSaved] = useState(initialPreferences)
  const [saving, setSaving] = useState(false)
  const dirty = options.some(({ key }) => preferences[key] !== saved[key])
  useUnsavedChanges(dirty && !saving)

  async function save() {
    setSaving(true)
    try {
      const data = await apiFetch<{ preferences: NotificationPreferences }>('/api/notifications/preferences', {
        method: 'PATCH',
        body: JSON.stringify(preferences),
      })
      setPreferences(data.preferences)
      setSaved(data.preferences)
      toast('Настройки уведомлений сохранены', 'success')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <div className="grid gap-2 sm:grid-cols-2">
        {options.map((option) => {
          const Icon = option.icon
          const enabled = preferences[option.key]
          return (
            <div key={option.key} className="flex min-h-[5.25rem] items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3.5 dark:border-white/[0.08] dark:bg-white/[0.025]">
              <div className="flex min-w-0 items-start gap-3">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white text-slate-500 shadow-sm dark:bg-white/[0.06] dark:text-slate-300 dark:shadow-none">
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-slate-950 dark:text-white">{option.title}</div>
                  <div className="mt-0.5 text-xs leading-5 text-slate-500">{option.description}</div>
                </div>
              </div>
              <Switch checked={enabled} onCheckedChange={() => setPreferences((current) => ({ ...current, [option.key]: !current[option.key] }))} label={`${enabled ? 'Выключить' : 'Включить'} ${option.title.toLowerCase()}`} compact />
            </div>
          )
        })}
      </div>
      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs leading-5 text-slate-500">Подарки всегда сохраняются в истории бонусов, даже если уведомления выключены.</p>
        <button type="button" className="btn-primary w-full sm:w-auto" disabled={!dirty || saving} onClick={() => void save()}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Сохранить
        </button>
      </div>
    </div>
  )
}
