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
      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          <h2 id="mobile-plan-picker-title" className="text-lg font-semibold text-slate-950 dark:text-white">
            Выберите срок
          </h2>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">Цена и скидка обновятся сразу</p>
        </div>
        <span className="text-xs font-medium text-emerald-600 dark:text-emerald-300">Оплата онлайн</span>
      </div>

      <div className="-mx-4 flex snap-x gap-2 overflow-x-auto px-4 pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {plans.map((plan) => {
          const selected = plan.id === selectedPlan.id
          return (
            <button
              key={plan.id}
              type="button"
              aria-pressed={selected}
              onClick={() => setSelectedId(plan.id)}
              className={cn(
                'relative min-w-[7.25rem] snap-start rounded-lg border px-3 py-2.5 text-left transition-colors',
                selected
                  ? 'border-cyan-400 bg-slate-950 text-white shadow-lg shadow-slate-950/15 dark:bg-white dark:text-slate-950'
                  : 'border-slate-200 bg-white/80 text-slate-700 dark:border-white/10 dark:bg-white/[0.035] dark:text-slate-200'
              )}
            >
              <span className="block text-sm font-semibold">{plan.durationDays} дней</span>
              <span className={cn('mt-0.5 block text-xs', selected ? 'text-cyan-200 dark:text-slate-500' : 'text-slate-500 dark:text-slate-400')}>
                {plan.shortPrice}
              </span>
              {selected ? (
                <span className="absolute right-2 top-2 grid h-5 w-5 place-items-center rounded-full bg-cyan-400 text-slate-950 dark:bg-slate-950 dark:text-white">
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
