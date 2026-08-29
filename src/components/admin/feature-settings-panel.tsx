'use client'

import { type ComponentType, useRef, useState } from 'react'
import { Check, Gift, LifeBuoy, Loader2, Send, UsersRound } from 'lucide-react'
import type { FeatureFlags } from '@/lib/feature-flags'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/cn'

const items: Array<{
  key: keyof FeatureFlags
  title: string
  description: string
  icon: ComponentType<{ className?: string }>
}> = [
  { key: 'referrals', title: 'Рефералы', description: 'Приглашения и награды', icon: UsersRound },
  { key: 'bonusBox', title: 'Подарки', description: 'Подарочный бокс', icon: Gift },
  { key: 'support', title: 'Поддержка', description: 'Обращения клиентов', icon: LifeBuoy },
  { key: 'broadcasts', title: 'Рассылки', description: 'Кабинет, Telegram и email', icon: Send },
]

export function FeatureSettingsPanel({ initialFeatures }: { initialFeatures: FeatureFlags }) {
  const [features, setFeatures] = useState(initialFeatures)
  const [savingKey, setSavingKey] = useState<keyof FeatureFlags | null>(null)
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null)
  const savingRef = useRef(false)

  async function toggle(key: keyof FeatureFlags) {
    if (savingRef.current) return
    savingRef.current = true
    const previous = features
    const next = { ...features, [key]: !features[key] }
    setFeatures(next)
    setSavingKey(key)
    setMessage(null)
    try {
      const response = await fetch('/api/admin/system/features', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(next),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok || !data?.features) {
        throw new Error(data?.error || 'Не удалось сохранить настройки')
      }
      setFeatures(data.features)
      setMessage({ text: `${items.find((item) => item.key === key)?.title ?? 'Функция'}: сохранено` })
    } catch (error) {
      setFeatures(previous)
      setMessage({ text: error instanceof Error ? error.message : 'Не удалось сохранить настройку', error: true })
    } finally {
      savingRef.current = false
      setSavingKey(null)
    }
  }

  return (
    <section data-testid="feature-settings" className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-white/10 dark:bg-white/[0.025]">
      <div className="flex flex-col gap-3 border-b border-slate-200 p-4 dark:border-white/[0.07] sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold">Функции кабинета</h2>
          <p className="mt-0.5 text-sm text-slate-500">Раздел сразу появляется или скрывается у пользователей</p>
        </div>
        <span className="inline-flex items-center gap-1.5 self-start rounded-lg bg-emerald-50 px-2.5 py-1.5 text-xs font-medium text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300 sm:self-auto">
          {savingKey ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
          {savingKey ? 'Сохраняем' : 'Автосохранение'}
        </span>
      </div>

      <div className="grid gap-2 p-3 sm:grid-cols-2 sm:p-4">
        {items.map((item) => {
          const enabled = features[item.key]
          const Icon = item.icon
          return (
            <div
              key={item.key}
              className={cn(
                'flex min-h-[4.5rem] items-center justify-between gap-3 rounded-xl border p-3 transition',
                enabled
                  ? 'border-brand-200 bg-brand-50/60 dark:border-brand-400/20 dark:bg-brand-400/[0.07]'
                  : 'border-slate-200 bg-slate-50/60 dark:border-white/[0.08] dark:bg-white/[0.025]'
              )}
            >
              <div className="flex min-w-0 items-center gap-3">
                <span className={cn(
                  'grid h-9 w-9 shrink-0 place-items-center rounded-lg',
                  enabled ? 'bg-white text-brand-700 shadow-sm dark:bg-white/10 dark:text-brand-200' : 'bg-slate-100 text-slate-400 dark:bg-white/[0.06]'
                )}>
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <div className="font-medium">{item.title}</div>
                  <div className="mt-0.5 text-xs text-slate-500">{item.description}</div>
                </div>
              </div>
              <Switch
                checked={enabled}
                disabled={savingKey !== null}
                onCheckedChange={() => void toggle(item.key)}
                label={`${enabled ? 'Выключить' : 'Включить'} ${item.title.toLowerCase()}`}
                compact
              />
            </div>
          )
        })}
      </div>

      {message ? (
        <div className={cn(
          'border-t border-slate-200 px-4 py-2.5 text-sm dark:border-white/[0.07]',
          message.error ? 'text-red-600 dark:text-red-300' : 'text-slate-500'
        )} role="status">
          {message.text}
        </div>
      ) : null}
    </section>
  )
}
