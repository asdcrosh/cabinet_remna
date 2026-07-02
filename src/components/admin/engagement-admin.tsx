'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Gift, Play, Send, Sparkles } from 'lucide-react'
import { apiFetch } from '@/lib/api-client'
import { toast } from '@/components/ui/toaster'

type PromoOption = { id: string; code: string; discountPercent: number }

type BundleRow = {
  id: string
  key: string
  enabled: boolean
  title: string
  description: string
  cta: string
  href: string | null
  minPlanDurationDays: number | null
  bonusAttempts: number
  bonusMultiplier: number
  promoCodeId: string | null
  showOnHome: boolean
  showOnPlans: boolean
  showInBroadcasts: boolean
  showAsPersonalOffer: boolean
}

type SeasonalRow = {
  id: string
  key: string
  enabled: boolean
  title: string
  description: string
  audience: string
  recurringWeekday: number | null
  notifyInApp: boolean
  notifyTelegram: boolean
  actionHref: string
  actionLabel: string
  bonusAttempts: number
  promoCodeId: string | null
  notificationCooldownHours: number
}

type AutoFunnelRow = {
  id: string
  key: string
  enabled: boolean
  title: string
  triggerDays: number
  cooldownDays: number
  channels: string[]
  messageTitle: string
  messageBody: string
  actionHref: string
  actionLabel: string
  actionOpenInTelegram: boolean
  bonusAttempts: number
  promoCodeId: string | null
  maxRecipientsPerRun: number
}

export function EngagementAdmin({
  bundles,
  seasonalEvents,
  autoFunnels,
  promoCodes,
}: {
  bundles: BundleRow[]
  seasonalEvents: SeasonalRow[]
  autoFunnels: AutoFunnelRow[]
  promoCodes: PromoOption[]
}) {
  const router = useRouter()
  const [savingId, setSavingId] = useState<string | null>(null)
  const [running, setRunning] = useState<string | null>(null)
  const [bundleForms, setBundleForms] = useState(() => new Map(bundles.map((item) => [item.id, { ...item, href: item.href ?? '/dashboard/plans' }])))
  const [seasonForms, setSeasonForms] = useState(() => new Map(seasonalEvents.map((item) => [item.id, { ...item }])))
  const [funnelForms, setFunnelForms] = useState(() => new Map(autoFunnels.map((item) => [item.id, { ...item }])))

  async function saveBundle(id: string) {
    const form = bundleForms.get(id)
    if (!form) return
    setSavingId(id)
    try {
      await apiFetch(`/api/admin/engagement/bundles/${id}`, { method: 'PATCH', body: JSON.stringify(form) })
      toast('Bundle сохранён', 'success')
      router.refresh()
    } finally {
      setSavingId(null)
    }
  }

  async function saveSeason(id: string) {
    const form = seasonForms.get(id)
    if (!form) return
    setSavingId(id)
    try {
      await apiFetch(`/api/admin/engagement/seasonal-events/${id}`, { method: 'PATCH', body: JSON.stringify(form) })
      toast('Событие сохранено', 'success')
      router.refresh()
    } finally {
      setSavingId(null)
    }
  }

  async function saveFunnel(id: string) {
    const form = funnelForms.get(id)
    if (!form) return
    setSavingId(id)
    try {
      await apiFetch(`/api/admin/autofunnels/${id}`, { method: 'PATCH', body: JSON.stringify(form) })
      toast('Автоворонка сохранена', 'success')
      router.refresh()
    } finally {
      setSavingId(null)
    }
  }

  async function run(kind: 'seasonal' | 'funnels') {
    setRunning(kind)
    try {
      const result = await apiFetch<{ sent?: number; skipped?: number; giftsGranted?: number }>(
        kind === 'seasonal' ? '/api/admin/seasonal-events/run' : '/api/admin/autofunnels/run',
        { method: 'POST' }
      )
      toast(`Запуск выполнен: отправлено ${result.sent ?? 0}`, 'success')
      router.refresh()
    } finally {
      setRunning(null)
    }
  }

  return (
    <div className="space-y-5">
      <section className="surface-card p-4">
        <SectionHeader icon={<Gift className="h-5 w-5" />} title="Personal bundles" />
        <div className="mt-4 grid gap-3 xl:grid-cols-3">
          {Array.from(bundleForms.values()).map((form) => (
            <article key={form.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-white/10 dark:bg-white/[0.03]">
              <CompactToggle checked={form.enabled} label={form.title} onChange={(enabled) => setBundleForms(updateMap(bundleForms, form.id, { enabled }))} />
              <Field label="Описание"><textarea className="input min-h-20" value={form.description} onChange={(e) => setBundleForms(updateMap(bundleForms, form.id, { description: e.target.value }))} /></Field>
              <div className="grid gap-2 sm:grid-cols-2">
                <Field label="Открытия"><input className="input" type="number" value={form.bonusAttempts} onChange={(e) => setBundleForms(updateMap(bundleForms, form.id, { bonusAttempts: Number(e.target.value) }))} /></Field>
                <Field label="Множитель"><input className="input" type="number" value={form.bonusMultiplier} onChange={(e) => setBundleForms(updateMap(bundleForms, form.id, { bonusMultiplier: Number(e.target.value) }))} /></Field>
              </div>
              <Field label="Промокод"><PromoSelect value={form.promoCodeId ?? ''} promoCodes={promoCodes} onChange={(promoCodeId) => setBundleForms(updateMap(bundleForms, form.id, { promoCodeId }))} /></Field>
              <Field label="Ссылка"><input className="input" value={form.href} onChange={(e) => setBundleForms(updateMap(bundleForms, form.id, { href: e.target.value }))} /></Field>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <Check label="Главная" checked={form.showOnHome} onChange={(showOnHome) => setBundleForms(updateMap(bundleForms, form.id, { showOnHome }))} />
                <Check label="Тарифы" checked={form.showOnPlans} onChange={(showOnPlans) => setBundleForms(updateMap(bundleForms, form.id, { showOnPlans }))} />
                <Check label="Рассылки" checked={form.showInBroadcasts} onChange={(showInBroadcasts) => setBundleForms(updateMap(bundleForms, form.id, { showInBroadcasts }))} />
                <Check label="Оффер" checked={form.showAsPersonalOffer} onChange={(showAsPersonalOffer) => setBundleForms(updateMap(bundleForms, form.id, { showAsPersonalOffer }))} />
              </div>
              <button className="btn-primary mt-3 w-full justify-center" onClick={() => void saveBundle(form.id)} disabled={savingId === form.id}>
                {savingId === form.id ? 'Сохраняем...' : 'Сохранить'}
              </button>
            </article>
          ))}
        </div>
      </section>

      <section className="surface-card p-4">
        <SectionHeader
          icon={<Sparkles className="h-5 w-5" />}
          title="Сезонные события"
          action={<button className="btn-secondary" onClick={() => void run('seasonal')} disabled={running === 'seasonal'}><Send className="h-4 w-4" />Запустить уведомления</button>}
        />
        <div className="mt-4 grid gap-3 xl:grid-cols-3">
          {Array.from(seasonForms.values()).map((form) => (
            <article key={form.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-white/10 dark:bg-white/[0.03]">
              <CompactToggle checked={form.enabled} label={form.title} onChange={(enabled) => setSeasonForms(updateMap(seasonForms, form.id, { enabled }))} />
              <Field label="Описание"><textarea className="input min-h-20" value={form.description} onChange={(e) => setSeasonForms(updateMap(seasonForms, form.id, { description: e.target.value }))} /></Field>
              <div className="grid gap-2 sm:grid-cols-2">
                <Field label="Аудитория">
                  <select className="input" value={form.audience} onChange={(e) => setSeasonForms(updateMap(seasonForms, form.id, { audience: e.target.value }))}>
                    <option value="ALL">Все</option>
                    <option value="ACTIVE">Активные</option>
                    <option value="INACTIVE">Неактивные</option>
                    <option value="TELEGRAM">Telegram</option>
                  </select>
                </Field>
                <Field label="День недели"><input className="input" type="number" min={0} max={6} value={form.recurringWeekday ?? ''} onChange={(e) => setSeasonForms(updateMap(seasonForms, form.id, { recurringWeekday: e.target.value ? Number(e.target.value) : null }))} /></Field>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <Field label="Открытия"><input className="input" type="number" value={form.bonusAttempts} onChange={(e) => setSeasonForms(updateMap(seasonForms, form.id, { bonusAttempts: Number(e.target.value) }))} /></Field>
                <Field label="Cooldown, ч"><input className="input" type="number" value={form.notificationCooldownHours} onChange={(e) => setSeasonForms(updateMap(seasonForms, form.id, { notificationCooldownHours: Number(e.target.value) }))} /></Field>
              </div>
              <Field label="Промокод"><PromoSelect value={form.promoCodeId ?? ''} promoCodes={promoCodes} onChange={(promoCodeId) => setSeasonForms(updateMap(seasonForms, form.id, { promoCodeId }))} /></Field>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <Check label="ЛК" checked={form.notifyInApp} onChange={(notifyInApp) => setSeasonForms(updateMap(seasonForms, form.id, { notifyInApp }))} />
                <Check label="Telegram" checked={form.notifyTelegram} onChange={(notifyTelegram) => setSeasonForms(updateMap(seasonForms, form.id, { notifyTelegram }))} />
              </div>
              <button className="btn-primary mt-3 w-full justify-center" onClick={() => void saveSeason(form.id)} disabled={savingId === form.id}>
                {savingId === form.id ? 'Сохраняем...' : 'Сохранить'}
              </button>
            </article>
          ))}
        </div>
      </section>

      <section className="surface-card p-4">
        <SectionHeader
          icon={<Send className="h-5 w-5" />}
          title="Автоворонки"
          action={<button className="btn-secondary" onClick={() => void run('funnels')} disabled={running === 'funnels'}><Play className="h-4 w-4" />Запустить</button>}
        />
        <div className="mt-4 grid gap-3 xl:grid-cols-2">
          {Array.from(funnelForms.values()).map((form) => (
            <article key={form.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-white/10 dark:bg-white/[0.03]">
              <CompactToggle checked={form.enabled} label={form.title} onChange={(enabled) => setFunnelForms(updateMap(funnelForms, form.id, { enabled }))} />
              <div className="grid gap-2 sm:grid-cols-3">
                <Field label="Триггер, дн."><input className="input" type="number" value={form.triggerDays} onChange={(e) => setFunnelForms(updateMap(funnelForms, form.id, { triggerDays: Number(e.target.value) }))} /></Field>
                <Field label="Cooldown"><input className="input" type="number" value={form.cooldownDays} onChange={(e) => setFunnelForms(updateMap(funnelForms, form.id, { cooldownDays: Number(e.target.value) }))} /></Field>
                <Field label="Лимит"><input className="input" type="number" value={form.maxRecipientsPerRun} onChange={(e) => setFunnelForms(updateMap(funnelForms, form.id, { maxRecipientsPerRun: Number(e.target.value) }))} /></Field>
              </div>
              <Field label="Заголовок"><input className="input" value={form.messageTitle} onChange={(e) => setFunnelForms(updateMap(funnelForms, form.id, { messageTitle: e.target.value }))} /></Field>
              <Field label="Сообщение"><textarea className="input min-h-20" value={form.messageBody} onChange={(e) => setFunnelForms(updateMap(funnelForms, form.id, { messageBody: e.target.value }))} /></Field>
              <div className="grid gap-2 sm:grid-cols-[1fr_10rem]">
                <Field label="Ссылка"><input className="input" value={form.actionHref} onChange={(e) => setFunnelForms(updateMap(funnelForms, form.id, { actionHref: e.target.value }))} /></Field>
                <Field label="Кнопка"><input className="input" value={form.actionLabel} onChange={(e) => setFunnelForms(updateMap(funnelForms, form.id, { actionLabel: e.target.value }))} /></Field>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <Field label="Открытия"><input className="input" type="number" value={form.bonusAttempts} onChange={(e) => setFunnelForms(updateMap(funnelForms, form.id, { bonusAttempts: Number(e.target.value) }))} /></Field>
                <Field label="Промокод"><PromoSelect value={form.promoCodeId ?? ''} promoCodes={promoCodes} onChange={(promoCodeId) => setFunnelForms(updateMap(funnelForms, form.id, { promoCodeId }))} /></Field>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                {(['IN_APP', 'TELEGRAM', 'EMAIL'] as const).map((channel) => (
                  <Check
                    key={channel}
                    label={channel}
                    checked={form.channels.includes(channel)}
                    onChange={(checked) => setFunnelForms(updateMap(funnelForms, form.id, {
                      channels: checked
                        ? Array.from(new Set([...form.channels, channel]))
                        : form.channels.filter((item) => item !== channel),
                    }))}
                  />
                ))}
                <Check label="WebApp" checked={form.actionOpenInTelegram} onChange={(actionOpenInTelegram) => setFunnelForms(updateMap(funnelForms, form.id, { actionOpenInTelegram }))} />
              </div>
              <button className="btn-primary mt-3 w-full justify-center" onClick={() => void saveFunnel(form.id)} disabled={savingId === form.id}>
                {savingId === form.id ? 'Сохраняем...' : 'Сохранить'}
              </button>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}

function SectionHeader({ icon, title, action }: { icon: React.ReactNode; title: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-lg bg-cyan-100 text-cyan-700 dark:bg-cyan-400/15 dark:text-cyan-200">{icon}</div>
        <h2 className="text-lg font-semibold text-slate-950 dark:text-white">{title}</h2>
      </div>
      {action}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="mt-3 block text-xs font-medium text-slate-500 dark:text-slate-400">{label}{children}</label>
}

function CompactToggle({ checked, label, onChange }: { checked: boolean; label: string; onChange: (checked: boolean) => void }) {
  return (
    <label className="flex items-start gap-2 text-sm font-semibold text-slate-950 dark:text-white">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span>{label}</span>
    </label>
  )
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2 py-2 dark:border-white/10 dark:bg-surface-900">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span>{label}</span>
    </label>
  )
}

function PromoSelect({ value, promoCodes, onChange }: { value: string; promoCodes: PromoOption[]; onChange: (value: string) => void }) {
  return (
    <select className="input" value={value} onChange={(event) => onChange(event.target.value)}>
      <option value="">Без промокода</option>
      {promoCodes.map((promoCode) => (
        <option key={promoCode.id} value={promoCode.id}>{promoCode.code} · {promoCode.discountPercent}%</option>
      ))}
    </select>
  )
}

function updateMap<T extends { id: string }>(map: Map<string, T>, id: string, patch: Partial<T>) {
  const next = new Map(map)
  const current = next.get(id)
  if (current) next.set(id, { ...current, ...patch })
  return next
}
