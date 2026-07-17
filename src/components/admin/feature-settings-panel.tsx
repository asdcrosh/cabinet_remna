'use client'

import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import type { FeatureFlags } from '@/lib/feature-flags'
import { cn } from '@/lib/cn'

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
          <p className="mt-0.5 text-sm text-slate-500">Изменения применяются сразу, без правки .env</p>
        </div>
        <button type="button" className="btn-primary w-full sm:w-auto" disabled={!dirty || saving} onClick={save}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Сохранить
        </button>
      </div>

      <div className="divide-y divide-slate-200 dark:divide-white/[0.07]">
        {items.map((item) => {
          const enabled = features[item.key]
          return (
            <div key={item.key} className="flex items-center justify-between gap-4 px-4 py-3.5">
              <div className="min-w-0">
                <div className="font-medium">{item.title}</div>
                <div className="mt-0.5 text-sm text-slate-500">{item.description}</div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={enabled}
                aria-label={`${enabled ? 'Выключить' : 'Включить'} ${item.title.toLowerCase()}`}
                onClick={() => toggle(item.key)}
                className={cn(
                  'relative h-7 w-12 shrink-0 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:ring-offset-2 dark:ring-offset-[#0b0f14]',
                  enabled ? 'bg-cyan-500' : 'bg-slate-300 dark:bg-white/15'
                )}
              >
                <span className={cn(
                  'absolute left-0 top-1 h-5 w-5 rounded-full bg-white shadow-sm transition-transform',
                  enabled ? 'translate-x-5' : 'translate-x-1'
                )} />
              </button>
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
