'use client'

import { FormEvent, useState } from 'react'
import { Check, Loader2, Save } from 'lucide-react'
import type { SupportSettings } from '@/lib/support-settings'

export function SupportSettingsPanel({ initialSettings }: { initialSettings: SupportSettings }) {
  const [settings, setSettings] = useState(initialSettings)
  const [templates, setTemplates] = useState(initialSettings.quickReplies.join('\n'))
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null)

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving) return
    const quickReplies = templates.split('\n').map((value) => value.trim()).filter(Boolean)
    setSaving(true)
    setMessage(null)
    try {
      const response = await fetch('/api/admin/system/support', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...settings, quickReplies }),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok || !data?.settings) throw new Error(data?.error || 'Не удалось сохранить настройки')
      setSettings(data.settings)
      setTemplates(data.settings.quickReplies.join('\n'))
      setMessage({ text: 'Настройки поддержки сохранены' })
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : 'Не удалось сохранить настройки', error: true })
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={save} className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-white/10 dark:bg-white/[0.025]">
      <div className="border-b border-slate-200 p-4 dark:border-white/[0.07]">
        <h2 className="text-lg font-semibold">Работа поддержки</h2>
        <p className="mt-0.5 text-sm text-slate-500">Пороги ожидания ответа и готовые фразы операторов</p>
      </div>
      <div className="grid gap-5 p-4 lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]">
        <div className="space-y-3">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Предупреждать через, минут</span>
            <input
              type="number"
              min={5}
              max={43199}
              value={settings.slaWarningMinutes}
              onChange={(event) => setSettings((current) => ({ ...current, slaWarningMinutes: Number(event.target.value) }))}
              className="input"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Считать SLA нарушенным через, минут</span>
            <input
              type="number"
              min={6}
              max={43200}
              value={settings.slaBreachMinutes}
              onChange={(event) => setSettings((current) => ({ ...current, slaBreachMinutes: Number(event.target.value) }))}
              className="input"
            />
          </label>
          <p className="text-xs leading-5 text-slate-500">Счётчик идёт от последнего сообщения клиента только в очереди «Нужно ответить».</p>
        </div>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">Шаблоны ответов</span>
          <textarea
            value={templates}
            onChange={(event) => setTemplates(event.target.value)}
            rows={9}
            maxLength={10000}
            className="input min-h-52 resize-y py-2.5 leading-6"
          />
          <span className="mt-1.5 block text-xs text-slate-500">Один шаблон на строку, до 20 шаблонов.</span>
        </label>
      </div>
      <div className="flex flex-col gap-3 border-t border-slate-200 px-4 py-3 dark:border-white/[0.07] sm:flex-row sm:items-center sm:justify-between">
        <div role="status" className={message?.error ? 'text-sm text-red-600 dark:text-red-300' : 'text-sm text-slate-500'}>
          {message ? message.text : 'Изменения применятся после сохранения'}
        </div>
        <button type="submit" className="btn-primary justify-center" disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : message && !message.error ? <Check className="h-4 w-4" /> : <Save className="h-4 w-4" />}
          {saving ? 'Сохраняем...' : 'Сохранить'}
        </button>
      </div>
    </form>
  )
}
