'use client'

import { useState } from 'react'
import { CreditCard, Loader2, RotateCcw, ShieldCheck } from 'lucide-react'
import { cn } from '@/lib/cn'
import type { PublicPaymentProviderSettings } from '@/lib/payment-settings'

type EditableSettings = Omit<PublicPaymentProviderSettings, 'source'>

export function PaymentProviderSettingsPanel({
  initialSettings,
}: {
  initialSettings: PublicPaymentProviderSettings
}) {
  const [settings, setSettings] = useState<EditableSettings>(stripSource(initialSettings))
  const [saved, setSaved] = useState<EditableSettings>(stripSource(initialSettings))
  const [source, setSource] = useState(initialSettings.source)
  const [yookassaSecret, setYookassaSecret] = useState('')
  const [payAnyWaySecret, setPayAnyWaySecret] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const dirty = JSON.stringify(settings) !== JSON.stringify(saved) || Boolean(yookassaSecret || payAnyWaySecret)

  async function save() {
    setSaving(true)
    setMessage(null)
    try {
      const response = await fetch('/api/admin/system/payment-providers', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          yookassa: {
            enabled: settings.yookassa.enabled,
            shopId: settings.yookassa.shopId,
            secretKey: yookassaSecret || undefined,
            webhookAllowedIps: settings.yookassa.webhookAllowedIps,
          },
          payAnyWay: {
            enabled: settings.payAnyWay.enabled,
            merchantId: settings.payAnyWay.merchantId,
            integrityCode: payAnyWaySecret || undefined,
            testMode: settings.payAnyWay.testMode,
          },
        }),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok || !data?.settings) throw new Error(data?.error || 'Не удалось сохранить настройки')
      applyResponse(data.settings)
      setMessage('Платёжные системы обновлены')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Не удалось сохранить настройки')
    } finally {
      setSaving(false)
    }
  }

  async function resetToEnvironment() {
    setSaving(true)
    setMessage(null)
    try {
      const response = await fetch('/api/admin/system/payment-providers', { method: 'DELETE' })
      const data = await response.json().catch(() => null)
      if (!response.ok || !data?.settings) throw new Error(data?.error || 'Не удалось загрузить настройки .env')
      applyResponse(data.settings)
      setMessage('Используются настройки из .env')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Не удалось загрузить настройки .env')
    } finally {
      setSaving(false)
    }
  }

  function applyResponse(next: PublicPaymentProviderSettings) {
    const editable = stripSource(next)
    setSettings(editable)
    setSaved(editable)
    setSource(next.source)
    setYookassaSecret('')
    setPayAnyWaySecret('')
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-white/10 dark:bg-white/[0.025]">
      <div className="flex flex-col gap-3 border-b border-slate-200 p-4 dark:border-white/[0.07] sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold">Платёжные системы</h2>
          <p className="mt-0.5 text-sm text-slate-500">
            Источник: {source === 'database' ? 'настройки кабинета' : '.env'}
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          {source === 'database' ? (
            <button type="button" className="btn-secondary" disabled={saving} onClick={resetToEnvironment}>
              <RotateCcw className="h-4 w-4" />
              Взять из .env
            </button>
          ) : null}
          <button type="button" className="btn-primary" disabled={!dirty || saving} onClick={save}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Сохранить
          </button>
        </div>
      </div>

      <div className="grid gap-0 divide-y divide-slate-200 dark:divide-white/[0.07] lg:grid-cols-2 lg:divide-x lg:divide-y-0">
        <ProviderCard
          icon={<CreditCard className="h-5 w-5" />}
          title="ЮKassa"
          enabled={settings.yookassa.enabled}
          configured={Boolean(
            settings.yookassa.enabled &&
            settings.yookassa.shopId.trim() &&
            (settings.yookassa.secretConfigured || yookassaSecret.trim())
          )}
          onToggle={() => setSettings((current) => ({
            ...current,
            yookassa: { ...current.yookassa, enabled: !current.yookassa.enabled },
          }))}
        >
          <Field label="Shop ID">
            <input
              className="input"
              value={settings.yookassa.shopId}
              onChange={(event) => setSettings((current) => ({
                ...current,
                yookassa: { ...current.yookassa, shopId: event.target.value },
              }))}
              placeholder="Идентификатор магазина"
              disabled={!settings.yookassa.enabled}
            />
          </Field>
          <Field label="Secret key" hint={settings.yookassa.secretConfigured ? 'Ключ уже сохранён' : 'Ключ не задан'}>
            <input
              className="input"
              type="password"
              autoComplete="new-password"
              value={yookassaSecret}
              onChange={(event) => setYookassaSecret(event.target.value)}
              placeholder={settings.yookassa.secretConfigured ? 'Оставьте пустым, чтобы не менять' : 'Секретный ключ'}
              disabled={!settings.yookassa.enabled}
            />
          </Field>
          <Field label="Разрешённые IP/CIDR" hint="Через запятую">
            <input
              className="input"
              value={settings.yookassa.webhookAllowedIps}
              onChange={(event) => setSettings((current) => ({
                ...current,
                yookassa: { ...current.yookassa, webhookAllowedIps: event.target.value },
              }))}
              placeholder="185.71.76.0/27, 77.75.153.0/25"
              disabled={!settings.yookassa.enabled}
            />
          </Field>
          <CallbackPath path="/api/webhook/yookassa" />
        </ProviderCard>

        <ProviderCard
          icon={<ShieldCheck className="h-5 w-5" />}
          title="PayAnyWay"
          enabled={settings.payAnyWay.enabled}
          configured={Boolean(
            settings.payAnyWay.enabled &&
            settings.payAnyWay.merchantId.trim() &&
            (settings.payAnyWay.integrityCodeConfigured || payAnyWaySecret.trim())
          )}
          onToggle={() => setSettings((current) => ({
            ...current,
            payAnyWay: { ...current.payAnyWay, enabled: !current.payAnyWay.enabled },
          }))}
        >
          <Field label="Номер счёта MNT_ID">
            <input
              className="input"
              inputMode="numeric"
              value={settings.payAnyWay.merchantId}
              onChange={(event) => setSettings((current) => ({
                ...current,
                payAnyWay: { ...current.payAnyWay, merchantId: event.target.value },
              }))}
              placeholder="49907299"
              disabled={!settings.payAnyWay.enabled}
            />
          </Field>
          <Field label="Код проверки целостности" hint={settings.payAnyWay.integrityCodeConfigured ? 'Код уже сохранён' : 'Код не задан'}>
            <input
              className="input"
              type="password"
              autoComplete="new-password"
              value={payAnyWaySecret}
              onChange={(event) => setPayAnyWaySecret(event.target.value)}
              placeholder={settings.payAnyWay.integrityCodeConfigured ? 'Оставьте пустым, чтобы не менять' : 'Код из Self.PayAnyWay'}
              disabled={!settings.payAnyWay.enabled}
            />
            {payAnyWaySecret === '12345' ? (
              <p className="mt-1.5 text-xs text-amber-600 dark:text-amber-400">
                Временный legacy-код Self.PayAnyWay. После синхронизации у провайдера замените его на случайный.
              </p>
            ) : null}
          </Field>
          <div className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 px-3 py-2.5 dark:border-white/10">
            <div>
              <div className="text-sm font-medium">Тестовый режим</div>
              <div className="text-xs text-slate-500">Использовать demo.moneta.ru</div>
            </div>
            <Switch
              label="Тестовый режим PayAnyWay"
              checked={settings.payAnyWay.testMode}
              disabled={!settings.payAnyWay.enabled}
              onClick={() => setSettings((current) => ({
                ...current,
                payAnyWay: { ...current.payAnyWay, testMode: !current.payAnyWay.testMode },
              }))}
            />
          </div>
          <CallbackPath path="/api/webhook/payanyway" label="Pay URL" />
        </ProviderCard>
      </div>

      {message ? (
        <div className="border-t border-slate-200 px-4 py-2.5 text-sm text-slate-500 dark:border-white/[0.07]" role="status">
          {message}
        </div>
      ) : null}
    </section>
  )
}

function ProviderCard({
  icon,
  title,
  enabled,
  configured,
  onToggle,
  children,
}: {
  icon: React.ReactNode
  title: string
  enabled: boolean
  configured: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  return (
    <div className="p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-200">
            {icon}
          </span>
          <div>
            <h3 className="font-semibold">{title}</h3>
            <div className={cn('text-xs', configured ? 'text-emerald-600 dark:text-emerald-300' : 'text-slate-500')}>
              {configured ? 'Готова к оплате' : enabled ? 'Заполните данные' : 'Отключена'}
            </div>
          </div>
        </div>
        <Switch label={`${enabled ? 'Выключить' : 'Включить'} ${title}`} checked={enabled} onClick={onToggle} />
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-center justify-between gap-2 text-sm font-medium">
        {label}
        {hint ? <span className="text-xs font-normal text-slate-400">{hint}</span> : null}
      </span>
      {children}
    </label>
  )
}

function CallbackPath({ path, label = 'Webhook URL' }: { path: string; label?: string }) {
  return (
    <div className="rounded-xl bg-slate-50 px-3 py-2.5 dark:bg-white/5">
      <div className="text-xs font-medium text-slate-400">{label}</div>
      <code className="mt-1 block break-all text-xs text-slate-600 dark:text-slate-300">{path}</code>
    </div>
  )
}

function Switch({
  label,
  checked,
  disabled = false,
  onClick,
}: {
  label: string
  checked: boolean
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-label={label}
      aria-checked={checked}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'relative h-7 w-12 shrink-0 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 disabled:cursor-not-allowed disabled:opacity-40',
        checked ? 'bg-cyan-500' : 'bg-slate-300 dark:bg-white/15'
      )}
    >
      <span className={cn(
        'absolute left-0 top-1 h-5 w-5 rounded-full bg-white shadow-sm transition-transform',
        checked ? 'translate-x-5' : 'translate-x-1'
      )} />
    </button>
  )
}

function stripSource(settings: PublicPaymentProviderSettings): EditableSettings {
  return { yookassa: settings.yookassa, payAnyWay: settings.payAnyWay }
}
