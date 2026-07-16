'use client'

import { useMemo, useState } from 'react'
import { Check } from 'lucide-react'
import { cn } from '@/lib/cn'
import { PlanCard, type PlanCardProps } from './plan-card'

type MobilePlan = PlanCardProps & {
  shortPrice: string
}

export function MobilePlanPicker({ plans, initialPlanId }: { plans: MobilePlan[]; initialPlanId?: string }) {
  const initialId = useMemo(() => {
    if (initialPlanId && plans.some((plan) => plan.id === initialPlanId)) return initialPlanId
    return plans.find((plan) => plan.current)?.id ?? plans.find((plan) => plan.popular)?.id ?? plans[0]?.id ?? ''
  }, [initialPlanId, plans])
  const [selectedId, setSelectedId] = useState(initialId)
  const selectedPlan = plans.find((plan) => plan.id === selectedId) ?? plans[0]

  if (!selectedPlan) return null

  return (
    <section className="md:hidden" aria-labelledby="mobile-plan-picker-title">
      <h2 id="mobile-plan-picker-title" className="mb-3 text-lg font-semibold text-slate-950 dark:text-white">Выберите срок</h2>

      <div className="-mx-4 flex snap-x gap-2 overflow-x-auto px-4 pb-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {plans.map((plan) => {
          const selected = plan.id === selectedPlan.id
          return (
            <button
              key={plan.id}
              type="button"
              aria-pressed={selected}
              onClick={() => setSelectedId(plan.id)}
              className={cn(
                'relative min-w-[7rem] snap-start rounded-xl border px-3 py-2.5 text-left transition-colors',
                selected
                  ? 'border-slate-950 bg-slate-950 text-white dark:border-white dark:bg-white dark:text-slate-950'
                  : 'border-slate-200 bg-white/80 text-slate-700 dark:border-white/10 dark:bg-white/[0.035] dark:text-slate-200'
              )}
            >
              <span className="block text-sm font-semibold">{plan.durationDays} дней</span>
              <span className={cn('mt-0.5 block text-xs', selected ? 'text-cyan-700 dark:text-cyan-200' : 'text-slate-500 dark:text-slate-400')}>
                {plan.shortPrice}
              </span>
              {selected ? (
                <span className="absolute right-2 top-2 grid h-5 w-5 place-items-center">
                  <Check className="h-3 w-3" />
                </span>
              ) : null}
            </button>
          )
        })}
      </div>

      <PlanCard {...selectedPlan} />
    </section>
  )
}
