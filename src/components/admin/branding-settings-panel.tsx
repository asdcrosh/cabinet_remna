'use client'

import { useRef, useState } from 'react'
import { Check, FileImage, Loader2, Moon, Palette, Sun, Trash2, Upload } from 'lucide-react'
import { useRouter } from 'next/navigation'
import type { PublicBrandSettings } from '@/lib/branding'
import { BRAND_THEME_PRESETS, getBrandThemePreview } from '@/lib/branding-theme'
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
  const previewAccentColor = isHexColor(settings.accentColor) ? settings.accentColor : saved.accentColor
  const previewSecondaryColor = isHexColor(settings.accentSecondaryColor) ? settings.accentSecondaryColor : saved.accentSecondaryColor
  const selectedPreset = BRAND_THEME_PRESETS.find((preset) => (
    preset.accentColor.toLowerCase() === settings.accentColor.toLowerCase()
    && preset.accentSecondaryColor.toLowerCase() === settings.accentSecondaryColor.toLowerCase()
  ))
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
      setSaved((current) => ({ ...current, logoUrl: data.logoUrl }))
      toast('Логотип загружен и установлен', 'success')
      router.refresh()
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Не удалось загрузить логотип')
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  async function save() {
    if (!isHexColor(settings.accentColor) || !isHexColor(settings.accentSecondaryColor)) {
      toast('Цвет должен быть указан в формате #D832D4')
      return
    }
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
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-white/10 dark:bg-white/[0.025]">
      <div className="flex flex-col gap-3 border-b border-slate-200 p-4 dark:border-white/[0.07] sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold"><Palette className="h-5 w-5" />Тема и бренд</h2>
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">Готовая палитра, логотип и проверка читаемости в обоих режимах</p>
        </div>
        <button type="button" className="btn-primary w-full sm:w-auto" disabled={!dirty || saving || uploading} onClick={save}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Сохранить оформление
        </button>
      </div>

      <div className="space-y-5 p-4 sm:p-5">
        <div className="grid gap-4 rounded-2xl border border-slate-200 bg-slate-50/70 p-4 dark:border-white/10 dark:bg-white/[0.025] lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <div className="flex min-w-0 items-center gap-4">
            <BrandLogo className="h-16 w-16 shrink-0 text-white" src={settings.logoUrl} />
            <div className="min-w-0">
              <div className="font-semibold">Логотип кабинета</div>
              <p className="mt-1 max-w-2xl text-sm leading-5 text-slate-500 dark:text-slate-400">
                Если изображение не загружено или недоступно, интерфейс автоматически покажет стандартный знак.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
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

        <div>
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h3 className="font-semibold">Готовые темы</h3>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Выберите основу. «Фирменная» возвращает предыдущий готовый стиль.</p>
            </div>
            <span className="text-xs font-medium uppercase tracking-[0.12em] text-slate-400">
              {selectedPreset ? selectedPreset.name : 'Своя палитра'}
            </span>
          </div>

          <div className="mt-3 flex snap-x gap-3 overflow-x-auto pb-2 [scrollbar-width:thin] xl:grid xl:grid-cols-5 xl:overflow-visible xl:pb-0">
            {BRAND_THEME_PRESETS.map((preset) => {
              const active = selectedPreset?.id === preset.id
              const light = getBrandThemePreview(preset.accentColor, preset.accentSecondaryColor, 'light')
              const dark = getBrandThemePreview(preset.accentColor, preset.accentSecondaryColor, 'dark')
              return (
                <button
                  key={preset.id}
                  type="button"
                  aria-pressed={active}
                  className="group w-56 shrink-0 snap-start overflow-hidden rounded-2xl border bg-transparent text-left transition hover:-translate-y-0.5 xl:w-auto"
                  style={{ borderColor: active ? preset.accentColor : undefined }}
                  onClick={() => setSettings((current) => ({
                    ...current,
                    accentColor: preset.accentColor,
                    accentSecondaryColor: preset.accentSecondaryColor,
                  }))}
                >
                  <div className="grid h-20 grid-cols-2">
                    <PresetModeSample colors={light} />
                    <PresetModeSample colors={dark} />
                  </div>
                  <div className="flex min-h-24 gap-2 border-t border-slate-200 bg-white p-3 dark:border-white/10 dark:bg-white/[0.025]">
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-slate-900 dark:text-white">{preset.name}</div>
                      <div className="mt-1 text-xs leading-4 text-slate-500 dark:text-slate-400">{preset.description}</div>
                    </div>
                    {active ? (
                      <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full" style={{ background: preset.accentColor, color: light.accentOn }}>
                        <Check className="h-3.5 w-3.5" />
                      </span>
                    ) : null}
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        <details className="group overflow-hidden rounded-2xl border border-slate-200 dark:border-white/10">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 [&::-webkit-details-marker]:hidden">
            <span>
              <span className="block font-semibold">Расширенная настройка</span>
              <span className="mt-0.5 block text-sm text-slate-500 dark:text-slate-400">Свои цвета и проверка контраста</span>
            </span>
            <span className="text-xs font-semibold text-brand-700 dark:text-brand-300 group-open:hidden">Открыть</span>
            <span className="hidden text-xs font-semibold text-brand-700 dark:text-brand-300 group-open:inline">Свернуть</span>
          </summary>
          <div className="grid gap-5 border-t border-slate-200 p-4 dark:border-white/10 xl:grid-cols-[minmax(17rem,0.55fr)_minmax(0,1.45fr)]">
            <div className="rounded-xl bg-slate-50/70 p-4 dark:bg-white/[0.025]">
              <div className="font-semibold">Точная настройка</div>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Можно изменить любой шаблон вручную. Текстовые оттенки рассчитываются автоматически.</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                <ColorField label="Основной акцент" value={settings.accentColor} onChange={(accentColor) => setSettings((current) => ({ ...current, accentColor }))} />
                <ColorField label="Глубокий акцент" value={settings.accentSecondaryColor} onChange={(accentSecondaryColor) => setSettings((current) => ({ ...current, accentSecondaryColor }))} />
              </div>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between gap-3">
                <div className="font-semibold">Проверка читаемости</div>
                <div className="text-xs text-slate-500 dark:text-slate-400">Контраст текста подбирается отдельно</div>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <ThemeModePreview mode="light" accentColor={previewAccentColor} accentSecondaryColor={previewSecondaryColor} />
                <ThemeModePreview mode="dark" accentColor={previewAccentColor} accentSecondaryColor={previewSecondaryColor} />
              </div>
            </div>
          </div>
        </details>
      </div>
    </section>
  )
}

function PresetModeSample({ colors }: { colors: ReturnType<typeof getBrandThemePreview> }) {
  return (
    <span className="relative block p-2.5" style={{ background: colors.background }}>
      <span className="block h-2 w-12 rounded-full" style={{ background: colors.text }} />
      <span className="mt-2 block h-1.5 w-8 rounded-full" style={{ background: colors.muted }} />
      <span className="absolute bottom-2.5 left-2.5 h-2 w-8 rounded-full" style={{ background: colors.accent }} />
      <span className="absolute bottom-2.5 right-2.5 h-2 w-5 rounded-full" style={{ background: colors.secondary }} />
    </span>
  )
}

function ThemeModePreview({ mode, accentColor, accentSecondaryColor }: {
  mode: 'light' | 'dark'
  accentColor: string
  accentSecondaryColor: string
}) {
  const colors = getBrandThemePreview(accentColor, accentSecondaryColor, mode)
  const ModeIcon = mode === 'light' ? Sun : Moon
  const modeLabel = mode === 'light' ? 'Светлая тема' : 'Тёмная тема'

  return (
    <div className="overflow-hidden rounded-2xl border p-4" style={{ background: colors.background, borderColor: colors.border, color: colors.text }}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-semibold"><ModeIcon className="h-4 w-4" />{modeLabel}</div>
        <div className="flex gap-1.5">
          <span className="h-3 w-3 rounded-full" style={{ background: colors.accent }} />
          <span className="h-3 w-3 rounded-full" style={{ background: colors.secondary }} />
        </div>
      </div>
      <div className="mt-4 rounded-xl border p-4" style={{ background: colors.surface, borderColor: colors.border }}>
        <div className="text-base font-semibold">Подписка активна</div>
        <p className="mt-1 text-sm" style={{ color: colors.muted }}>Основной и вторичный текст остаются читаемыми.</p>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <span className="text-sm font-semibold" style={{ color: colors.accentText }}>Управлять подключением</span>
          <button type="button" className="rounded-lg px-3 py-2 text-xs font-semibold" style={{ background: colors.secondary, color: colors.secondaryOn }}>
            Продлить
          </button>
        </div>
      </div>
    </div>
  )
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const validValue = /^#[0-9a-f]{6}$/i.test(value) ? value : '#000000'
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium">{label}</span>
      <span className="flex min-h-11 items-center gap-2 rounded-lg border border-slate-200 px-2 dark:border-white/10">
        <input type="color" value={validValue} className="brand-color-picker h-8 w-10 shrink-0 cursor-pointer p-0" onChange={(event) => onChange(event.target.value)} />
        <FileImage className="h-4 w-4 shrink-0 text-slate-400" />
        <input
          type="text"
          value={value.toUpperCase()}
          maxLength={7}
          spellCheck={false}
          className="brand-color-hex-input min-w-0 flex-1 p-0 font-mono text-sm uppercase outline-none"
          onChange={(event) => onChange(event.target.value)}
        />
      </span>
    </label>
  )
}

function isHexColor(value: string) {
  return /^#[0-9a-f]{6}$/i.test(value)
}
