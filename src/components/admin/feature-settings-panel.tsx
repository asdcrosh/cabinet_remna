'use client'

import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import type { FeatureFlags } from '@/lib/feature-flags'
import { useUnsavedChanges } from '@/lib/use-unsaved-changes'
import { Switch } from '@/components/ui/switch'

const items: Array<{
  key: keyof FeatureFlags
  title: string
  description: string
}> = [
  { key: 'referrals', title: 'Рефералы', description: 'Ссылки приглашений и начисление наград' },
  { key: 'bonusBox', title: 'Подарки', description: 'Подарочный бокс и выдача открытий' },
  { key: 'support', title: 'Поддержка', description: 'Обращения пользователей и ответы команды' },
  { key: 'broadcasts', title: 'Рассылки', description: 'Массовые сообщения в кабинет, Telegram и email' },
]

export function FeatureSettingsPanel({ initialFeatures }: { initialFeatures: FeatureFlags }) {
  const [features, setFeatures] = useState(initialFeatures)
  const [saved, setSaved] = useState(initialFeatures)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const dirty = items.some(({ key }) => features[key] !== saved[key])
  useUnsavedChanges(dirty && !saving)

  function toggle(key: keyof FeatureFlags) {
    setFeatures((current) => ({ ...current, [key]: !current[key] }))
    setMessage(null)
  }

  async function save() {
    setSaving(true)
    setMessage(null)
    try {
      const response = await fetch('/api/admin/system/features', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(features),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok || !data?.features) {
        throw new Error(data?.error || 'Не удалось сохранить настройки')
      }
      setFeatures(data.features)
      setSaved(data.features)
      setMessage('Настройки сохранены')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Не удалось сохранить настройки')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section data-testid="feature-settings" className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-white/10 dark:bg-white/[0.025]">
      <div className="flex flex-col gap-3 border-b border-slate-200 p-4 dark:border-white/[0.07] sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold">Функции кабинета</h2>
          <p className="mt-0.5 text-sm text-slate-500">Включайте только те разделы, которыми пользуетесь</p>
        </div>
        <button type="button" className="btn-primary w-full sm:w-auto" disabled={!dirty || saving} onClick={save}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Сохранить
        </button>
      </div>

      <div className="grid gap-2 p-4 sm:grid-cols-2">
        {items.map((item) => {
          const enabled = features[item.key]
          return (
            <div key={item.key} className="flex min-h-[5rem] items-center justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50/60 p-3.5 dark:border-white/[0.08] dark:bg-white/[0.025]">
              <div className="min-w-0">
                <div className="font-medium">{item.title}</div>
                <div className="mt-0.5 text-sm text-slate-500">{item.description}</div>
              </div>
              <Switch
                checked={enabled}
                onCheckedChange={() => toggle(item.key)}
                label={`${enabled ? 'Выключить' : 'Включить'} ${item.title.toLowerCase()}`}
                compact
              />
            </div>
          )
        })}
      </div>

      {message ? (
        <div className="border-t border-slate-200 px-4 py-2.5 text-sm text-slate-500 dark:border-white/[0.07]" role="status">
          {message}
        </div>
      ) : null}
    </section>
  )
}
