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
      <h2 id="mobile-plan-picker-title" className="mb-3 text-lg font-semibold text-slate-950 dark:text-white md:sr-only">Выберите срок</h2>

      <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] md:mx-0 md:grid md:auto-rows-fr md:grid-cols-2 md:gap-4 md:overflow-visible md:px-0 md:pb-0 xl:grid-cols-3 [&::-webkit-scrollbar]:hidden">
        {orderedPlans.map((plan) => (
          <div key={plan.id} className="w-[min(88vw,23rem)] shrink-0 snap-center first:snap-start md:w-auto md:min-w-0 md:snap-none">
            <PlanCard {...plan} />
          </div>
        ))}
      </div>
    </section>
  )
}
