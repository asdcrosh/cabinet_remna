'use client'

import { type ReactNode, useMemo, useState } from 'react'
import {
  ArrowRight,
  CalendarDays,
  Check,
  Save,
  UserPlus,
  UsersRound,
  WalletCards,
  WandSparkles,
} from 'lucide-react'
import type { ReferralSettings } from '@/lib/referral-settings'
import { apiFetch } from '@/lib/api-client'
import { toast } from '@/components/ui/toaster'
import { cn } from '@/lib/cn'

export function ReferralSettingsAdmin({
  initialSettings,
  stats,
}: {
  initialSettings: ReferralSettings
  stats: { invited: number; rewards: number; applied: number }
}) {
  const [settings, setSettings] = useState(initialSettings)
  const [saved, setSaved] = useState(initialSettings)
  const [saving, setSaving] = useState(false)
  const dirty = JSON.stringify(settings) !== JSON.stringify(saved)
  const summary = useMemo(() => buildSummary(settings), [settings])

  function update<K extends keyof ReferralSettings>(key: K, value: ReferralSettings[K]) {
    setSettings((current) => ({ ...current, [key]: value }))
  }

  async function save() {
    setSaving(true)
    try {
      const data = await apiFetch<{ settings: ReferralSettings }>('/api/admin/referrals/settings', {
        method: 'PATCH',
        body: JSON.stringify(settings),
      })
      setSettings(data.settings)
      setSaved(data.settings)
      toast('Условия реферальной программы сохранены', 'success')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <section className="grid grid-cols-3 overflow-hidden rounded-xl border border-slate-200 bg-white dark:divide-white/10 dark:border-white/10 dark:bg-white/[0.025]">
        <Stat label="Приглашено" value={stats.invited} />
        <Stat label="Наград" value={stats.rewards} />
        <Stat label="Выдано" value={stats.applied} />
      </section>

      <section
        data-testid="referral-settings"
        className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-white/10 dark:bg-white/[0.025]"
      >
        <div className="border-b border-slate-200 p-4 dark:border-white/10 sm:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <div className="text-xs font-semibold uppercase tracking-[0.1em] text-cyan-700 dark:text-cyan-200">
                Условие начисления
              </div>
              <h2 className="mt-1 text-xl font-semibold tracking-tight text-slate-950 dark:text-white">
                Когда считать приглашение успешным
              </h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Новые правила применяются только к будущим приглашениям.
              </p>
            </div>
            {dirty || saving ? (
              <button
                type="button"
                className="btn-primary w-full justify-center lg:w-auto"
                onClick={() => void save()}
                disabled={saving}
              >
                <Save className="h-4 w-4" />
                {saving ? 'Сохраняем' : 'Сохранить условия'}
              </button>
            ) : (
              <span className="inline-flex min-h-9 w-fit items-center gap-2 text-sm font-medium text-emerald-700 dark:text-emerald-200">
                <Check className="h-4 w-4" />
                Сохранено
              </span>
            )}
          </div>

          <div className="mt-5 grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Момент начисления">
            <TriggerOption
              selected={settings.trigger === 'REGISTRATION'}
              title="После регистрации"
              description="Прокрутки выдаются сразу, дни после появления подписки."
              icon={<UserPlus className="h-5 w-5" />}
              onClick={() => update('trigger', 'REGISTRATION')}
            />
            <TriggerOption
              selected={settings.trigger === 'FIRST_PAYMENT'}
              title="После первой оплаты"
              description="Награда создаётся только после успешной выдачи тарифа."
              icon={<WalletCards className="h-5 w-5" />}
              onClick={() => update('trigger', 'FIRST_PAYMENT')}
            />
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className={cn(
              'rounded-xl border border-slate-200 p-3 dark:border-white/10',
              settings.trigger === 'REGISTRATION' && 'opacity-45'
            )}>
              <span className="block text-xs font-medium text-slate-500">Минимальная первая оплата</span>
              <span className="mt-2 flex items-center gap-2">
                <input
                  className="input min-w-0 flex-1"
                  type="number"
                  min={0}
                  max={1_000_000}
                  step={10}
                  value={Math.floor(settings.minimumPaymentKopecks / 100)}
                  disabled={settings.trigger === 'REGISTRATION'}
                  onChange={(event) => update(
                    'minimumPaymentKopecks',
                    Math.max(0, Number(event.target.value) || 0) * 100
                  )}
                  aria-label="Минимальная сумма первой оплаты"
                />
                <span className="text-sm font-semibold text-slate-500">₽</span>
              </span>
            </label>

            <label className="rounded-xl border border-slate-200 p-3 dark:border-white/10">
              <span className="block text-xs font-medium text-slate-500">Лимит наград одному пригласившему</span>
              <span className="mt-2 flex items-center gap-2">
                <input
                  className="input min-w-0 flex-1"
                  type="number"
                  min={0}
                  max={100_000}
                  value={settings.maxRewardsPerReferrer}
                  onChange={(event) => update(
                    'maxRewardsPerReferrer',
                    Math.max(0, Number(event.target.value) || 0)
                  )}
                  aria-label="Лимит наград одному пригласившему"
                />
                <span className="whitespace-nowrap text-xs font-medium text-slate-500">
                  {settings.maxRewardsPerReferrer === 0 ? 'без лимита' : 'чел.'}
                </span>
              </span>
            </label>
          </div>
        </div>

        <div className="grid lg:grid-cols-2">
          <RewardEditor
            title="Пригласившему"
            description="Пользователь, который поделился своей ссылкой."
            icon={<UsersRound className="h-5 w-5" />}
            days={settings.referrerBonusDays}
            attempts={settings.referrerAttempts}
            onDaysChange={(value) => update('referrerBonusDays', value)}
            onAttemptsChange={(value) => update('referrerAttempts', value)}
          />
          <RewardEditor
            title="Новому пользователю"
            description="Пользователь, который зарегистрировался по ссылке."
            icon={<UserPlus className="h-5 w-5" />}
            days={settings.referredBonusDays}
            attempts={settings.referredAttempts}
            onDaysChange={(value) => update('referredBonusDays', value)}
            onAttemptsChange={(value) => update('referredAttempts', value)}
            secondary
          />
        </div>

        <div className="flex flex-col gap-3 border-t border-slate-200 bg-slate-50/70 px-4 py-3.5 dark:border-white/10 dark:bg-white/[0.02] sm:flex-row sm:items-center">
          <span className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-400">Итог</span>
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 text-sm">
            <span className="font-medium text-slate-950 dark:text-white">{summary.condition}</span>
            <ArrowRight className="h-3.5 w-3.5 text-slate-400" />
            <span className="text-slate-600 dark:text-slate-300">{summary.referrer}</span>
            <span className="text-slate-300 dark:text-white/20">/</span>
            <span className="text-slate-600 dark:text-slate-300">{summary.referred}</span>
          </div>
        </div>
      </section>

      <p className="px-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
        Условия сохраняются внутри каждой награды. Если позже изменить дни или прокрутки, уже созданные начисления не пересчитаются.
      </p>
    </div>
  )
}

function TriggerOption({
  selected,
  title,
  description,
  icon,
  onClick,
}: {
  selected: boolean
  title: string
  description: string
  icon: ReactNode
  onClick: () => void
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onClick}
      className={cn(
        'flex min-h-20 items-start gap-3 rounded-xl border p-3.5 text-left transition-colors',
        selected
          ? 'border-cyan-500 bg-cyan-500/[0.07]'
          : 'border-slate-200 hover:border-slate-300 dark:border-white/10 dark:hover:border-white/20'
      )}
    >
      <span className={cn(
        'grid h-9 w-9 shrink-0 place-items-center rounded-lg',
        selected
          ? 'bg-cyan-500 text-white'
          : 'bg-slate-100 text-slate-500 dark:bg-white/[0.06] dark:text-slate-300'
      )}>
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-slate-950 dark:text-white">{title}</span>
        <span className="mt-1 block text-xs leading-5 text-slate-500 dark:text-slate-400">{description}</span>
      </span>
    </button>
  )
}

function RewardEditor({
  title,
  description,
  icon,
  days,
  attempts,
  onDaysChange,
  onAttemptsChange,
  secondary = false,
}: {
  title: string
  description: string
  icon: ReactNode
  days: number
  attempts: number
  onDaysChange: (value: number) => void
  onAttemptsChange: (value: number) => void
  secondary?: boolean
}) {
  const titleId = secondary ? 'referred-reward-title' : 'referrer-reward-title'
  return (
    <section aria-labelledby={titleId} className={cn(
      'p-4 sm:p-5',
      secondary && 'border-t border-slate-200 dark:border-white/10 lg:border-l lg:border-t-0'
    )}>
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-600 dark:bg-white/[0.06] dark:text-slate-300">
          {icon}
        </span>
        <div>
          <h3 id={titleId} className="font-semibold text-slate-950 dark:text-white">{title}</h3>
          <p className="mt-0.5 text-xs leading-5 text-slate-500 dark:text-slate-400">{description}</p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <RewardField
          label="Дней подписки"
          value={days}
          max={365}
          icon={<CalendarDays className="h-4 w-4" />}
          onChange={onDaysChange}
        />
        <RewardField
          label="Прокруток"
          value={attempts}
          max={100}
          icon={<WandSparkles className="h-4 w-4" />}
          onChange={onAttemptsChange}
        />
      </div>
    </section>
  )
}

function RewardField({
  label,
  value,
  max,
  icon,
  onChange,
}: {
  label: string
  value: number
  max: number
  icon: ReactNode
  onChange: (value: number) => void
}) {
  return (
    <label className="rounded-xl border border-slate-200 p-3 dark:border-white/10">
      <span className="flex items-center gap-2 text-xs font-medium text-slate-500">
        {icon}
        {label}
      </span>
      <input
        className="mt-2 w-full bg-transparent text-2xl font-semibold tracking-tight text-slate-950 outline-none dark:text-white"
        type="number"
        min={0}
        max={max}
        value={value}
        onChange={(event) => onChange(Math.max(0, Math.min(max, Number(event.target.value) || 0)))}
        aria-label={label}
      />
    </label>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-0 border-r border-slate-200 px-3 py-3 last:border-r-0 dark:border-white/10 sm:px-4">
      <div className="truncate text-[11px] font-medium uppercase tracking-[0.06em] text-slate-400">{label}</div>
      <div className="mt-1 text-xl font-semibold tracking-tight text-slate-950 dark:text-white">{value}</div>
    </div>
  )
}

function buildSummary(settings: ReferralSettings) {
  const condition = settings.trigger === 'REGISTRATION'
    ? 'Регистрация по ссылке'
    : settings.minimumPaymentKopecks > 0
      ? `Первая оплата от ${Math.floor(settings.minimumPaymentKopecks / 100)} ₽`
      : 'Первая успешная оплата'

  return {
    condition,
    referrer: `пригласившему ${rewardText(settings.referrerBonusDays, settings.referrerAttempts)}`,
    referred: `новому пользователю ${rewardText(settings.referredBonusDays, settings.referredAttempts)}`,
  }
}

function rewardText(days: number, attempts: number) {
  const parts = []
  if (days > 0) parts.push(`+${days} дн.`)
  if (attempts > 0) parts.push(`+${attempts} прокр.`)
  return parts.join(' и ') || 'без награды'
}
