'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Activity,
  CalendarRange,
  Check,
  CircleDollarSign,
  Flag,
  Plus,
  ShieldAlert,
  Target,
  Users,
} from 'lucide-react'
import { apiFetch } from '@/lib/api-client'
import { toast } from '@/components/ui/toaster'
import { cn } from '@/lib/cn'

export type BonusMissionAdminRow = {
  id: string
  title: string
  description: string | null
  type: 'PAYMENT_COUNT' | 'REFERRAL_COUNT' | 'LOGIN_STREAK'
  target: number
  rewardAttempts: number
  isActive: boolean
  startsAt: string | null
  endsAt: string | null
  participants: number
  completed: number
  claimed: number
}

export type BonusEventAdminRow = {
  id: string
  title: string
  description: string | null
  isActive: boolean
  startsAt: string
  endsAt: string
  attemptsPerUser: number
  weightMultiplier: number
  prizeIds: string[]
  maxClaims: number | null
  claimsCount: number
}

export type BonusRiskAdminRow = {
  id: string
  userId: string
  userEmail: string
  userName: string | null
  kind: 'SHARED_FINGERPRINT' | 'SELF_REFERRAL' | 'EXCESSIVE_BALANCE'
  score: number
  details: unknown
  createdAt: string
}

export type BonusAnalyticsAdmin = {
  days: number
  openings: number
  uniqueUsers: number
  rewardRate: number
  estimatedCostKopecks: number
  convertedUsers: number
  conversionRate: number
  attributedRevenueKopecks: number
  marginKopecks: number
  roiPercent: number | null
  fairnessAlerts: number
  distribution: Array<{
    prizeId: string
    title: string
    actual: number
    measuredActual: number
    expected: number
    plannedSamples: number
    probability: number
    deviationPercent: number | null
    zScore: number
    flagged: boolean
  }>
}

type PrizeOption = { id: string; title: string }

const missionInitial = {
  title: '',
  description: '',
  type: 'PAYMENT_COUNT' as BonusMissionAdminRow['type'],
  target: 1,
  rewardAttempts: 1,
  startsAt: '',
  endsAt: '',
}

function eventInitial() {
  const now = new Date()
  const endsAt = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000)
  return {
    title: '',
    description: '',
    startsAt: localDateTime(now),
    endsAt: localDateTime(endsAt),
    attemptsPerUser: 1,
    weightMultiplier: 2,
    prizeIds: [] as string[],
    maxClaims: '',
  }
}

export function BonusBoxEngagementAdmin({
  analytics,
  missions,
  events,
  riskSignals,
  prizes,
}: {
  analytics: BonusAnalyticsAdmin
  missions: BonusMissionAdminRow[]
  events: BonusEventAdminRow[]
  riskSignals: BonusRiskAdminRow[]
  prizes: PrizeOption[]
}) {
  const router = useRouter()
  const [missionForm, setMissionForm] = useState(missionInitial)
  const [eventForm, setEventForm] = useState(eventInitial)
  const [loading, setLoading] = useState<string | null>(null)

  async function createMission() {
    setLoading('mission')
    try {
      await apiFetch('/api/admin/bonus-box/missions', {
        method: 'POST',
        body: JSON.stringify({
          ...missionForm,
          description: missionForm.description || null,
          isActive: true,
          startsAt: toIsoOrNull(missionForm.startsAt),
          endsAt: toIsoOrNull(missionForm.endsAt),
        }),
      })
      toast('Задание создано', 'success')
      setMissionForm(missionInitial)
      router.refresh()
    } catch {
      // apiFetch уже покажет toast
    } finally {
      setLoading(null)
    }
  }

  async function toggleMission(mission: BonusMissionAdminRow) {
    setLoading(mission.id)
    try {
      await apiFetch(`/api/admin/bonus-box/missions/${mission.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          title: mission.title,
          description: mission.description,
          type: mission.type,
          target: mission.target,
          rewardAttempts: mission.rewardAttempts,
          isActive: !mission.isActive,
          startsAt: mission.startsAt,
          endsAt: mission.endsAt,
        }),
      })
      router.refresh()
    } catch {
      // apiFetch уже покажет toast
    } finally {
      setLoading(null)
    }
  }

  async function createEvent() {
    setLoading('event')
    try {
      await apiFetch('/api/admin/bonus-box/events', {
        method: 'POST',
        body: JSON.stringify({
          ...eventForm,
          description: eventForm.description || null,
          isActive: true,
          startsAt: new Date(eventForm.startsAt).toISOString(),
          endsAt: new Date(eventForm.endsAt).toISOString(),
          maxClaims: eventForm.maxClaims ? Number(eventForm.maxClaims) : null,
        }),
      })
      toast('Сезонное событие создано', 'success')
      setEventForm(eventInitial())
      router.refresh()
    } catch {
      // apiFetch уже покажет toast
    } finally {
      setLoading(null)
    }
  }

  async function toggleEvent(event: BonusEventAdminRow) {
    setLoading(event.id)
    try {
      await apiFetch(`/api/admin/bonus-box/events/${event.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          title: event.title,
          description: event.description,
          isActive: !event.isActive,
          startsAt: event.startsAt,
          endsAt: event.endsAt,
          attemptsPerUser: event.attemptsPerUser,
          weightMultiplier: event.weightMultiplier,
          prizeIds: event.prizeIds,
          maxClaims: event.maxClaims,
        }),
      })
      router.refresh()
    } catch {
      // apiFetch уже покажет toast
    } finally {
      setLoading(null)
    }
  }

  async function reviewRisk(id: string) {
    setLoading(id)
    try {
      await apiFetch(`/api/admin/bonus-box/risk/${id}`, { method: 'PATCH' })
      toast('Сигнал отмечен проверенным', 'success')
      router.refresh()
    } catch {
      // apiFetch уже покажет toast
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="page-stack">
      <section className="border-y border-slate-200 py-4 dark:border-white/10">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-cyan-700 dark:text-cyan-200">
              Последние {analytics.days} дней
            </div>
            <h2 className="mt-1 text-lg font-semibold">Экономика бонусов</h2>
          </div>
          {analytics.fairnessAlerts > 0 && (
            <span className="border-l-2 border-red-500 pl-2 text-sm font-semibold text-red-600 dark:text-red-300">
              Отклонений шансов: {analytics.fairnessAlerts}
            </span>
          )}
        </div>
        <div className="mt-4 grid grid-cols-2 gap-x-5 gap-y-4 lg:grid-cols-4 xl:grid-cols-7">
          <Metric icon={<Activity />} label="Открытия" value={analytics.openings} />
          <Metric icon={<Users />} label="Участники" value={analytics.uniqueUsers} />
          <Metric icon={<Target />} label="С наградой" value={percent(analytics.rewardRate)} />
          <Metric icon={<Check />} label="Конверсия" value={percent(analytics.conversionRate)} />
          <Metric icon={<CircleDollarSign />} label="Доход после бокса" value={money(analytics.attributedRevenueKopecks)} />
          <Metric icon={<CircleDollarSign />} label="Стоимость призов" value={money(analytics.estimatedCostKopecks)} />
          <Metric
            icon={<Flag />}
            label="ROI"
            value={analytics.roiPercent == null ? 'Нет себестоимости' : `${analytics.roiPercent.toFixed(0)}%`}
            tone={analytics.roiPercent != null && analytics.roiPercent < 0 ? 'danger' : 'default'}
          />
        </div>

        <details className="mt-4 border-t border-slate-100 pt-3 dark:border-white/10">
          <summary className="cursor-pointer text-sm font-semibold">План и фактические выпадения</summary>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[680px] text-sm">
              <thead className="text-left text-xs uppercase text-slate-400">
                <tr>
                  <th className="py-2 font-medium">Подарок</th>
                  <th className="px-3 py-2 font-medium">Факт</th>
                  <th className="px-3 py-2 font-medium">Ожидалось</th>
                  <th className="px-3 py-2 font-medium">Средний шанс</th>
                  <th className="py-2 text-right font-medium">Отклонение</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/10">
                {analytics.distribution.map((row) => (
                  <tr key={row.prizeId}>
                    <td className="py-2.5 font-medium">{row.title}</td>
                    <td className="px-3 py-2.5 tabular-nums">{row.plannedSamples > 0 ? row.measuredActual : row.actual}</td>
                    <td className="px-3 py-2.5 tabular-nums">{row.plannedSamples > 0 ? row.expected.toFixed(1) : 'Нет данных'}</td>
                    <td className="px-3 py-2.5 tabular-nums">{row.plannedSamples > 0 ? percent(row.probability) : 'Нет данных'}</td>
                    <td className={cn('py-2.5 text-right tabular-nums', row.flagged && 'font-semibold text-red-600 dark:text-red-300')}>
                      {row.deviationPercent == null ? 'Нет данных' : `${row.deviationPercent > 0 ? '+' : ''}${row.deviationPercent.toFixed(1)}%`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <AdminProgramBlock title="Задания" meta={`${missions.length}`} icon={<Target className="h-4 w-4" />}>
          <div className="divide-y divide-slate-100 dark:divide-white/10">
            {missions.map((mission) => (
              <div key={mission.id} className="grid gap-2 py-3 sm:grid-cols-[1fr_auto] sm:items-center">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{mission.title}</span>
                    <Status active={mission.isActive} />
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    {missionTypeLabel(mission.type)} · цель {mission.target} · награда {mission.rewardAttempts} · получили {mission.claimed}/{mission.participants}
                  </div>
                </div>
                <button
                  type="button"
                  className="btn-secondary min-h-9 px-3 text-xs"
                  disabled={loading === mission.id}
                  onClick={() => toggleMission(mission)}
                >
                  {mission.isActive ? 'Остановить' : 'Запустить'}
                </button>
              </div>
            ))}
          </div>
          <details className="mt-3 border-t border-slate-100 pt-3 dark:border-white/10">
            <summary className="cursor-pointer text-sm font-semibold">Новое задание</summary>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Input label="Название" value={missionForm.title} onChange={(value) => setMissionForm((form) => ({ ...form, title: value }))} />
              <Select label="Тип" value={missionForm.type} onChange={(value) => setMissionForm((form) => ({ ...form, type: value as BonusMissionAdminRow['type'] }))}>
                <option value="PAYMENT_COUNT">Оплаты</option>
                <option value="REFERRAL_COUNT">Рефералы с оплатой</option>
                <option value="LOGIN_STREAK">Серия входов</option>
              </Select>
              <Input label="Цель" type="number" value={String(missionForm.target)} onChange={(value) => setMissionForm((form) => ({ ...form, target: Number(value) }))} />
              <Input label="Открытий в награду" type="number" value={String(missionForm.rewardAttempts)} onChange={(value) => setMissionForm((form) => ({ ...form, rewardAttempts: Number(value) }))} />
              <Input label="Начало" type="datetime-local" value={missionForm.startsAt} onChange={(value) => setMissionForm((form) => ({ ...form, startsAt: value }))} />
              <Input label="Окончание" type="datetime-local" value={missionForm.endsAt} onChange={(value) => setMissionForm((form) => ({ ...form, endsAt: value }))} />
              <div className="sm:col-span-2">
                <Input label="Описание" value={missionForm.description} onChange={(value) => setMissionForm((form) => ({ ...form, description: value }))} />
              </div>
              <button type="button" className="btn-primary justify-center sm:col-span-2" disabled={loading === 'mission'} onClick={createMission}>
                <Plus className="h-4 w-4" />
                Создать задание
              </button>
            </div>
          </details>
        </AdminProgramBlock>

        <AdminProgramBlock title="Сезонные события" meta={`${events.length}`} icon={<CalendarRange className="h-4 w-4" />}>
          <div className="divide-y divide-slate-100 dark:divide-white/10">
            {events.map((event) => (
              <div key={event.id} className="grid gap-2 py-3 sm:grid-cols-[1fr_auto] sm:items-center">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{event.title}</span>
                    <Status active={event.isActive} />
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    x{event.weightMultiplier} · +{event.attemptsPerUser} · участников {event.claimsCount}/{event.maxClaims ?? '∞'} · до {date(event.endsAt)}
                  </div>
                </div>
                <button
                  type="button"
                  className="btn-secondary min-h-9 px-3 text-xs"
                  disabled={loading === event.id}
                  onClick={() => toggleEvent(event)}
                >
                  {event.isActive ? 'Остановить' : 'Запустить'}
                </button>
              </div>
            ))}
          </div>
          <details className="mt-3 border-t border-slate-100 pt-3 dark:border-white/10">
            <summary className="cursor-pointer text-sm font-semibold">Новое событие</summary>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Input label="Название" value={eventForm.title} onChange={(value) => setEventForm((form) => ({ ...form, title: value }))} />
              <Input label="Описание" value={eventForm.description} onChange={(value) => setEventForm((form) => ({ ...form, description: value }))} />
              <Input label="Начало" type="datetime-local" value={eventForm.startsAt} onChange={(value) => setEventForm((form) => ({ ...form, startsAt: value }))} />
              <Input label="Окончание" type="datetime-local" value={eventForm.endsAt} onChange={(value) => setEventForm((form) => ({ ...form, endsAt: value }))} />
              <Input label="Открытий участнику" type="number" value={String(eventForm.attemptsPerUser)} onChange={(value) => setEventForm((form) => ({ ...form, attemptsPerUser: Number(value) }))} />
              <Input label="Множитель веса" type="number" value={String(eventForm.weightMultiplier)} onChange={(value) => setEventForm((form) => ({ ...form, weightMultiplier: Number(value) }))} />
              <Input label="Лимит участников" type="number" value={eventForm.maxClaims} onChange={(value) => setEventForm((form) => ({ ...form, maxClaims: value }))} placeholder="Без лимита" />
              <div className="sm:col-span-2">
                <div className="text-sm font-medium">Усиленные и временные подарки</div>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {prizes.map((prize) => (
                    <label key={prize.id} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={eventForm.prizeIds.includes(prize.id)}
                        onChange={(event) => setEventForm((form) => ({
                          ...form,
                          prizeIds: event.target.checked
                            ? [...form.prizeIds, prize.id]
                            : form.prizeIds.filter((id) => id !== prize.id),
                        }))}
                      />
                      {prize.title}
                    </label>
                  ))}
                </div>
              </div>
              <button type="button" className="btn-primary justify-center sm:col-span-2" disabled={loading === 'event'} onClick={createEvent}>
                <Plus className="h-4 w-4" />
                Создать событие
              </button>
            </div>
          </details>
        </AdminProgramBlock>
      </section>

      <section className="border-y border-slate-200 py-4 dark:border-white/10">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <ShieldAlert className="h-5 w-5 text-amber-500" />
              Антифрод
            </h2>
            <p className="mt-1 text-sm text-slate-500">Непроверенные сигналы без хранения открытых IP и User-Agent.</p>
          </div>
          <span className="font-mono text-xs text-slate-500">{riskSignals.length}</span>
        </div>
        <div className="mt-3 divide-y divide-slate-100 dark:divide-white/10">
          {riskSignals.map((signal) => (
            <div key={signal.id} className="grid gap-3 py-3 sm:grid-cols-[1fr_auto] sm:items-center">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{signal.userName || signal.userEmail}</span>
                  <span className="border-l-2 border-amber-400 pl-2 text-xs font-semibold text-amber-700 dark:text-amber-200">
                    риск {signal.score}
                  </span>
                </div>
                <div className="mt-1 text-xs text-slate-500">{riskLabel(signal.kind)} · {signal.userEmail} · {date(signal.createdAt)}</div>
                {riskDetails(signal.details) && (
                  <div className="mt-1 font-mono text-[10px] text-slate-400">{riskDetails(signal.details)}</div>
                )}
              </div>
              <button type="button" className="btn-secondary min-h-9 px-3 text-xs" disabled={loading === signal.id} onClick={() => reviewRisk(signal.id)}>
                Проверено
              </button>
            </div>
          ))}
          {riskSignals.length === 0 && <div className="py-4 text-sm text-slate-500">Непроверенных сигналов нет.</div>}
        </div>
      </section>
    </div>
  )
}

function Metric({ icon, label, value, tone = 'default' }: { icon: React.ReactNode; label: string; value: React.ReactNode; tone?: 'default' | 'danger' }) {
  return (
    <div className="min-w-0 border-l border-slate-200 pl-3 dark:border-white/10">
      <div className="flex items-center gap-1.5 text-xs text-slate-500 [&_svg]:h-3.5 [&_svg]:w-3.5">{icon}{label}</div>
      <div className={cn('mt-1 truncate font-semibold tabular-nums', tone === 'danger' && 'text-red-600 dark:text-red-300')}>{value}</div>
    </div>
  )
}

function AdminProgramBlock({ title, meta, icon, children }: { title: string; meta: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="border-y border-slate-200 py-4 dark:border-white/10">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-lg font-semibold">{icon}{title}</h2>
        <span className="font-mono text-xs text-slate-500">{meta}</span>
      </div>
      <div className="mt-2">{children}</div>
    </section>
  )
}

function Input({ label, value, onChange, type = 'text', placeholder }: { label: string; value: string; onChange: (value: string) => void; type?: string; placeholder?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium">{label}</span>
      <input className="input" type={type} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
    </label>
  )
}

function Select({ label, value, onChange, children }: { label: string; value: string; onChange: (value: string) => void; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium">{label}</span>
      <select className="input" value={value} onChange={(event) => onChange(event.target.value)}>{children}</select>
    </label>
  )
}

function Status({ active }: { active: boolean }) {
  return <span className={active ? 'badge-active' : 'badge-disabled'}>{active ? 'Активно' : 'Остановлено'}</span>
}

function toIsoOrNull(value: string) {
  return value ? new Date(value).toISOString() : null
}

function localDateTime(value: Date) {
  const offset = value.getTimezoneOffset() * 60_000
  return new Date(value.getTime() - offset).toISOString().slice(0, 16)
}

function percent(value: number) {
  return `${(value * 100).toFixed(1)}%`
}

function money(kopecks: number) {
  return new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(kopecks / 100)
}

function date(value: string) {
  return new Date(value).toLocaleDateString('ru-RU', { day: '2-digit', month: 'short', year: 'numeric' })
}

function missionTypeLabel(type: BonusMissionAdminRow['type']) {
  if (type === 'PAYMENT_COUNT') return 'Оплаты'
  if (type === 'REFERRAL_COUNT') return 'Рефералы'
  return 'Серия входов'
}

function riskLabel(kind: BonusRiskAdminRow['kind']) {
  if (kind === 'SELF_REFERRAL') return 'Возможный самореферал'
  if (kind === 'EXCESSIVE_BALANCE') return 'Необычно большой баланс'
  return 'Несколько аккаунтов с одним окружением'
}

function riskDetails(details: unknown) {
  if (!details || typeof details !== 'object' || Array.isArray(details)) return ''
  const data = details as Record<string, unknown>
  if (typeof data.accountCount === 'number') return `связанных аккаунтов: ${data.accountCount}`
  if (typeof data.balance === 'number') return `баланс открытий: ${data.balance}`
  if (typeof data.referrerId === 'string') return `пригласивший пользователь: ${data.referrerId}`
  return ''
}
