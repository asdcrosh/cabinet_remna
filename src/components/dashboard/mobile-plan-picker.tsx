'use client'

import type { ReactNode } from 'react'
import { useMemo, useState } from 'react'
import { Check } from 'lucide-react'
import { cn } from '@/lib/cn'
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
  const [selectedPlanId, setSelectedPlanId] = useState(featuredId)
  const activePlanId = orderedPlans.some((plan) => plan.id === selectedPlanId) ? selectedPlanId : featuredId
  const activePlan = orderedPlans.find((plan) => plan.id === activePlanId) ?? orderedPlans[0]!

  if (orderedPlans.length === 0) return null

  return (
    <section aria-labelledby="mobile-plan-picker-title">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="mobile-plan-picker-title" className="text-lg font-semibold tracking-tight text-slate-950 dark:text-white">
            Выберите тариф
          </h2>
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
            Сравните срок и стоимость, затем оформите выбранный вариант
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium tabular-nums text-slate-500 dark:bg-white/[0.06] dark:text-slate-400">
          {orderedPlans.length} {planCountLabel(orderedPlans.length)}
        </span>
      </div>

      <div className="rounded-[1.5rem] border border-slate-200/80 bg-slate-50/70 p-2 dark:border-white/[0.08] dark:bg-white/[0.025] sm:p-3">
        <div className="flex snap-x snap-mandatory gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:grid sm:snap-none sm:grid-cols-2 sm:overflow-visible sm:pb-0 xl:grid-cols-3" role="radiogroup" aria-label="Выбор тарифа">
          {orderedPlans.map((plan) => {
            const selected = plan.id === activePlanId
            return (
              <button
                key={plan.id}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setSelectedPlanId(plan.id)}
                className={cn(
                  'min-w-0 w-[85%] max-w-[17rem] shrink-0 snap-start rounded-[1.15rem] border px-3.5 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 sm:w-auto sm:max-w-none sm:shrink',
                  selected
                    ? 'border-cyan-300 bg-white shadow-sm dark:border-cyan-400/40 dark:bg-white/[0.07]'
                    : 'border-transparent bg-white/55 hover:border-slate-200 hover:bg-white dark:bg-white/[0.02] dark:hover:border-white/10 dark:hover:bg-white/[0.05]'
                )}
              >
                <span className="flex min-w-0 items-start justify-between gap-2">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-slate-950 dark:text-white">{plan.name}</span>
                    <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">
                      {plan.durationDays} дн. · {plan.monthlyPrice} / 30 дней
                    </span>
                  </span>
                  <span
                    className={cn(
                      'grid h-5 w-5 shrink-0 place-items-center rounded-full border',
                      selected
                        ? 'border-cyan-500 bg-cyan-500 text-white'
                        : 'border-slate-300 text-transparent dark:border-white/20'
                    )}
                    aria-hidden="true"
                  >
                    <Check className="h-3 w-3" />
                  </span>
                </span>
                <span className="mt-2.5 flex items-end justify-between gap-2">
                  <span className="text-lg font-semibold tracking-tight tabular-nums text-slate-950 dark:text-white">{plan.price}</span>
                  <span className="flex flex-wrap justify-end gap-1">
                    {plan.current ? <PlanPickerBadge>Текущий</PlanPickerBadge> : null}
                    {!plan.current && plan.popular ? <PlanPickerBadge>Популярный</PlanPickerBadge> : null}
                    {plan.savingsPercent > 0 && !plan.isPromo ? <PlanPickerBadge>−{plan.savingsPercent}%</PlanPickerBadge> : null}
                  </span>
                </span>
              </button>
            )
          })}
        </div>
      </div>

      <div className="mx-auto mt-3 max-w-2xl">
        {orderedPlans.map((plan) => (
          <div key={plan.id} className="min-w-0" hidden={plan.id !== activePlanId}>
            <PlanCard {...plan} />
          </div>
        ))}
      </div>
      <p className="mt-3 text-center text-xs text-slate-400 dark:text-slate-500">
        Выбран тариф «{activePlan.name}». Цена указана за весь срок.
      </p>
    </section>
  )
}

function PlanPickerBadge({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-full bg-cyan-50 px-2 py-0.5 text-[10px] font-semibold text-cyan-700 dark:bg-cyan-500/10 dark:text-cyan-300">
      {children}
    </span>
  )
}

function planCountLabel(count: number) {
  if (count % 10 === 1 && count % 100 !== 11) return 'тариф'
  if ([2, 3, 4].includes(count % 10) && ![12, 13, 14].includes(count % 100)) return 'тарифа'
  return 'тарифов'
}
