'use client'

import { useRef, useState } from 'react'
import { FileImage, Loader2, Palette, Trash2, Upload } from 'lucide-react'
import { useRouter } from 'next/navigation'
import type { PublicBrandSettings } from '@/lib/branding'
import { apiFetch } from '@/lib/api-client'
import { toast } from '@/components/ui/toaster'
import { BrandLogo } from '@/components/brand-logo'
import { useUnsavedChanges } from '@/lib/use-unsaved-changes'

export function BrandingSettingsPanel({ initialSettings }: { initialSettings: PublicBrandSettings }) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [settings, setSettings] = useState(initialSettings)
  const [saved, setSaved] = useState(initialSettings)
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const dirty = JSON.stringify(settings) !== JSON.stringify(saved)
  useUnsavedChanges(dirty && !saving && !uploading)

  async function upload(file: File | undefined) {
    if (!file) return
    setUploading(true)
    try {
      const form = new FormData()
      form.set('file', file)
      const response = await fetch('/api/admin/system/branding/upload', { method: 'POST', body: form })
      const data = await response.json().catch(() => null)
      if (!response.ok || !data?.logoUrl) throw new Error(data?.error || 'Не удалось загрузить логотип')
      setSettings((current) => ({ ...current, logoUrl: data.logoUrl }))
      toast('Логотип загружен. Сохраните оформление.', 'success')
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Не удалось загрузить логотип')
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  async function save() {
    setSaving(true)
    try {
      const data = await apiFetch<{ branding: PublicBrandSettings }>('/api/admin/system/branding', {
        method: 'PATCH',
        body: JSON.stringify(settings),
      })
      setSettings(data.branding)
      setSaved(data.branding)
      toast('Оформление сохранено', 'success')
      router.refresh()
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white dark:border-white/10 dark:bg-white/[0.025]">
      <div className="flex flex-col gap-3 border-b border-slate-200 p-4 dark:border-white/[0.07] sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold"><Palette className="h-5 w-5" />Оформление</h2>
          <p className="mt-0.5 text-sm text-slate-500">Логотип и два основных цвета интерфейса</p>
        </div>
        <button type="button" className="btn-primary w-full sm:w-auto" disabled={!dirty || saving || uploading} onClick={save}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Сохранить
        </button>
      </div>

      <div className="grid gap-5 p-4 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.75fr)]">
        <div>
          <div className="text-sm font-semibold">Логотип</div>
          <p className="mt-1 text-sm text-slate-500">Если логотип не загружен или файл недоступен, показывается стандартный знак кабинета.</p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <BrandLogo className="h-14 w-14 text-white" src={settings.logoUrl} />
            <input
              ref={inputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              onChange={(event) => void upload(event.target.files?.[0])}
            />
            <button type="button" className="btn-secondary" disabled={uploading} onClick={() => inputRef.current?.click()}>
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              Загрузить
            </button>
            {settings.logoUrl ? (
              <button type="button" className="btn-secondary text-red-600 dark:text-red-300" onClick={() => setSettings((current) => ({ ...current, logoUrl: null }))}>
                <Trash2 className="h-4 w-4" />Убрать
              </button>
            ) : null}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
          <ColorField label="Основной акцент" value={settings.accentColor} onChange={(accentColor) => setSettings((current) => ({ ...current, accentColor }))} />
          <ColorField label="Второй акцент" value={settings.accentSecondaryColor} onChange={(accentSecondaryColor) => setSettings((current) => ({ ...current, accentSecondaryColor }))} />
          <div className="sm:col-span-2 lg:col-span-1 xl:col-span-2">
            <div className="mb-1 text-sm font-medium">Предпросмотр</div>
            <div className="h-12 overflow-hidden rounded-xl border border-slate-200 dark:border-white/10" style={{ background: `linear-gradient(110deg, ${settings.accentColor}, ${settings.accentSecondaryColor})` }}>
              <span className="sr-only">Градиент выбранной палитры</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium">{label}</span>
      <span className="flex min-h-11 items-center gap-2 rounded-lg border border-slate-200 px-2 dark:border-white/10">
        <input type="color" value={value} className="h-8 w-10 cursor-pointer border-0 bg-transparent p-0" onChange={(event) => onChange(event.target.value)} />
        <FileImage className="h-4 w-4 text-slate-400" />
        <span className="font-mono text-sm uppercase">{value}</span>
      </span>
    </label>
  )
}
