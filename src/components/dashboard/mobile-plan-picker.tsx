'use client'

import { useMemo } from 'react'
import { PlanCard, type PlanCardProps } from './plan-card'

type CatalogPlan = PlanCardProps

export function PlanCatalog({ plans, initialPlanId }: { plans: CatalogPlan[]; initialPlanId?: string }) {
  const featuredId = useMemo(() => {
    if (initialPlanId && plans.some((plan) => plan.id === initialPlanId)) return initialPlanId
    return plans.find((plan) => plan.current)?.id ?? plans.find((plan) => plan.popular)?.id ?? plans[0]?.id ?? ''
  }, [initialPlanId, plans])
  const orderedPlans = useMemo(() => {
    const featured = plans.find((plan) => plan.id === featuredId)
    return featured ? [featured, ...plans.filter((plan) => plan.id !== featured.id)] : plans
  }, [featuredId, plans])

  if (orderedPlans.length === 0) return null

  return (
    <section aria-labelledby="mobile-plan-picker-title">
      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          <h2 id="mobile-plan-picker-title" className="text-lg font-semibold tracking-tight text-slate-950 dark:text-white">
            Выберите тариф
          </h2>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Цена указана за весь срок доступа
          </p>
        </div>
        <span className="shrink-0 text-xs font-medium text-slate-400">
          Доступно: {orderedPlans.length}
        </span>
      </div>

      <div className="grid auto-rows-fr grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-3">
        {orderedPlans.map((plan) => (
          <div key={plan.id} className="min-w-0">
            <PlanCard {...plan} />
          </div>
        ))}
      </div>
    </section>
  )
}
