'use client'

import { useState, useTransition } from 'react'
import { Gift, Loader2, PartyPopper } from 'lucide-react'
import { apiFetch } from '@/lib/api-client'
import type { SeasonalEventView } from '@/lib/seasonal-events'
import { toast } from '@/components/ui/toaster'

export function SeasonalEventsPanel({ initialEvents }: { initialEvents: SeasonalEventView[] }) {
  const [events, setEvents] = useState(initialEvents)
  const [claimingKey, setClaimingKey] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  if (events.length === 0) return null

  function claim(eventKey: string) {
    setClaimingKey(eventKey)
    startTransition(async () => {
      try {
        const result = await apiFetch<{ attemptsGranted: number; promoCode?: { code: string } | null }>(
          `/api/seasonal-events/${encodeURIComponent(eventKey)}/claim`,
          { method: 'POST' }
        )
        setEvents((current) => current.map((event) => event.key === eventKey ? { ...event, claimed: true } : event))
        if (result.promoCode?.code) {
          toast(`Промокод ${result.promoCode.code} получен`, 'success')
        } else {
          toast(`Начислено открытий: ${result.attemptsGranted}`, 'success')
        }
      } finally {
        setClaimingKey(null)
      }
    })
  }

  return (
    <section className="mb-4 rounded-lg border border-cyan-200 bg-cyan-50/80 p-4 dark:border-cyan-400/20 dark:bg-cyan-400/10">
      <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.14em] text-cyan-700 dark:text-cyan-200">
        <PartyPopper className="h-4 w-4" />
        Сезонные события
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-3">
        {events.map((event) => {
          const busy = isPending && claimingKey === event.key
          return (
            <article key={event.key} className="rounded-lg border border-white/70 bg-white/80 p-3 dark:border-white/10 dark:bg-surface-900/80">
              <h3 className="text-sm font-semibold text-slate-950 dark:text-white">{event.title}</h3>
              <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500 dark:text-slate-400">{event.description}</p>
              <button
                type="button"
                className="btn-secondary mt-3 w-full justify-center disabled:cursor-not-allowed disabled:opacity-60"
                disabled={event.claimed || busy || (event.bonusAttempts <= 0 && !event.promoCode)}
                onClick={() => claim(event.key)}
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Gift className="h-4 w-4" />}
                {event.claimed ? 'Получено' : event.bonusAttempts > 0 ? `Забрать +${event.bonusAttempts}` : event.actionLabel}
              </button>
            </article>
          )
        })}
      </div>
    </section>
  )
}
