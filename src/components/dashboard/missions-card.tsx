'use client'

import { useMemo, useState, useTransition } from 'react'
import { CheckCircle2, Gift, Loader2, Sparkles } from 'lucide-react'
import { cn } from '@/lib/cn'
import type { UserMissionView } from '@/lib/missions'

type MissionsCardProps = {
  initialMissions: UserMissionView[]
}

type MissionReward = {
  type: string
  promoCodeId?: string
  code?: string
  discountPercent?: number
  expiresAt?: string | null
  attemptsCount?: number
}

export function MissionsCard({ initialMissions }: MissionsCardProps) {
  const [missions, setMissions] = useState(initialMissions)
  const [claimingKey, setClaimingKey] = useState<string | null>(null)
  const [lastReward, setLastReward] = useState<MissionReward | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const visibleMissions = useMemo(
    () => missions.filter((mission) => !mission.claimed).slice(0, 4),
    [missions]
  )
  const completedCount = missions.filter((mission) => mission.claimed).length

  if (missions.length === 0) return null

  function claim(missionKey: string) {
    setError(null)
    setClaimingKey(missionKey)
    startTransition(async () => {
      try {
        const response = await fetch('/api/missions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ missionKey }),
        })
        const payload = await response.json().catch(() => null) as {
          error?: string
          reward?: MissionReward
          missions?: UserMissionView[]
        } | null
        if (!response.ok) throw new Error(payload?.error || 'Не удалось забрать награду')
        if (payload?.missions) setMissions(payload.missions)
        if (payload?.reward) setLastReward(payload.reward)
      } catch (claimError) {
        setError(claimError instanceof Error ? claimError.message : 'Не удалось забрать награду')
      } finally {
        setClaimingKey(null)
      }
    })
  }

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-[0_16px_38px_rgba(15,23,42,0.06)] dark:border-white/10 dark:bg-surface-900 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.16em] text-cyan-600 dark:text-cyan-300">
            <Sparkles className="h-4 w-4" />
            Миссии
          </div>
          <h2 className="mt-1 text-xl font-semibold text-slate-950 dark:text-white">Заберите быстрые награды</h2>
        </div>
        {completedCount > 0 && (
          <div className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-200">
            Получено: {completedCount}
          </div>
        )}
      </div>

      {lastReward?.type === 'PROMO_CODE' && lastReward.code && (
        <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-100">
          Ваш промокод: <span className="font-mono font-semibold">{lastReward.code}</span>
        </div>
      )}
      {lastReward?.type === 'BONUS_BOX_ATTEMPTS' && (
        <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-100">
          Начислено открытий bonus box: {lastReward.attemptsCount ?? 0}.
        </div>
      )}
      {error && (
        <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-400/20 dark:bg-rose-400/10 dark:text-rose-100">
          {error}
        </div>
      )}

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        {(visibleMissions.length > 0 ? visibleMissions : missions.slice(0, 2)).map((mission) => {
          const progressPercent = Math.min(100, Math.round((mission.progress / Math.max(1, mission.goal)) * 100))
          const canClaim = mission.completed && !mission.claimed
          const busy = isPending && claimingKey === mission.key

          return (
            <article
              key={mission.key}
              className="rounded-lg border border-slate-200 bg-slate-50/70 p-3 dark:border-white/10 dark:bg-white/[0.03]"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-slate-950 dark:text-white">{mission.title}</h3>
                  <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">{mission.description}</p>
                </div>
                <div className={cn(
                  'grid h-8 w-8 shrink-0 place-items-center rounded-lg',
                  mission.claimed
                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-200'
                    : 'bg-cyan-100 text-cyan-700 dark:bg-cyan-400/15 dark:text-cyan-200'
                )}>
                  {mission.claimed ? <CheckCircle2 className="h-4 w-4" /> : <Gift className="h-4 w-4" />}
                </div>
              </div>

              <div className="mt-3">
                <div className="mb-1 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                  <span>{mission.progress}/{mission.goal}</span>
                  <span>{mission.reward.label}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-white/10">
                  <div
                    className="h-full rounded-full bg-cyan-500 transition-all dark:bg-cyan-300"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              </div>

              <button
                type="button"
                className="btn-secondary mt-3 w-full justify-center disabled:cursor-not-allowed disabled:opacity-60"
                disabled={!canClaim || busy}
                onClick={() => claim(mission.key)}
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {mission.claimed ? 'Получено' : canClaim ? 'Забрать' : 'В процессе'}
              </button>
            </article>
          )
        })}
      </div>
    </section>
  )
}
