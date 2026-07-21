'use client'

import type { ReactNode } from 'react'
import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowRight, Check, CreditCard, X } from 'lucide-react'
import { cn } from '@/lib/cn'
import { formatPrice } from '@/lib/format'
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
  const [mobileCheckoutPlanId, setMobileCheckoutPlanId] = useState<string | null>(null)
  const activePlanId = orderedPlans.some((plan) => plan.id === selectedPlanId) ? selectedPlanId : featuredId
  const activePlan = orderedPlans.find((plan) => plan.id === activePlanId) ?? orderedPlans[0]
  const mobileCheckoutPlan = orderedPlans.find((plan) => plan.id === mobileCheckoutPlanId) ?? null
  const mobileCheckoutOpen = Boolean(mobileCheckoutPlan)

  useEffect(() => {
    if (!mobileCheckoutOpen) return

    const previousOverflow = document.body.style.overflow
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileCheckoutPlanId(null)
    }
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', closeOnEscape)

    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [mobileCheckoutOpen])

  if (orderedPlans.length === 0) return null

  return (
    <section aria-labelledby="mobile-plan-picker-title">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="mobile-plan-picker-title" className="text-lg font-semibold tracking-tight text-slate-950 dark:text-white">
            Выберите тариф
          </h2>
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
            Сначала выберите срок, затем проверьте детали и перейдите к оплате
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium tabular-nums text-slate-500 dark:bg-white/[0.06] dark:text-slate-400">
          {orderedPlans.length} {planCountLabel(orderedPlans.length)}
        </span>
      </div>

      <div className="grid gap-2.5 xl:hidden">
        {orderedPlans.map((plan) => (
          <article
            key={plan.id}
            className={cn(
              'rounded-[1.35rem] border border-slate-200/80 bg-white p-3.5 shadow-sm shadow-slate-950/[0.025] dark:border-white/[0.08] dark:bg-white/[0.035] dark:shadow-none',
              plan.current && 'border-cyan-300/80 bg-cyan-50/45 dark:border-cyan-400/35 dark:bg-cyan-500/[0.06]'
            )}
          >
            <div className="flex min-w-0 items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <h3 className="break-words text-base font-semibold tracking-tight text-slate-950 dark:text-white">{plan.name}</h3>
                  {plan.current ? <PlanPickerBadge>Текущий</PlanPickerBadge> : null}
                  {!plan.current && plan.popular ? <PlanPickerBadge>Популярный</PlanPickerBadge> : null}
                  {plan.savingsPercent > 0 && !plan.isPromo ? <PlanPickerBadge>−{plan.savingsPercent}%</PlanPickerBadge> : null}
                </div>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {plan.durationDays} дней · {dailyRateLabel(plan)}
                </p>
              </div>
              <span className="shrink-0 whitespace-nowrap text-lg font-semibold tabular-nums text-slate-950 dark:text-white">
                {plan.price}
              </span>
            </div>
            <div className="mt-3 flex justify-end border-t border-slate-100 pt-3 dark:border-white/[0.06]">
              <button
                type="button"
                aria-haspopup="dialog"
                onClick={() => setMobileCheckoutPlanId(plan.id)}
                disabled={!plan.isPromo && plan.paymentProviders?.length === 0}
                className="group inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-slate-100 px-3.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-200 hover:text-slate-950 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white/[0.06] dark:text-slate-200 dark:hover:bg-white/[0.1] dark:hover:text-white"
              >
                <CreditCard className="h-4 w-4" />
                {mobileCtaLabel(plan)}
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </button>
            </div>
          </article>
        ))}
      </div>

      <div className="hidden gap-4 xl:grid xl:grid-cols-2 xl:items-stretch">
        <div className="flex h-full flex-col overflow-hidden rounded-[1.75rem] border border-slate-200/80 bg-slate-50/65 p-4 dark:border-white/[0.08] dark:bg-white/[0.025]">
          <div className="mb-3 px-1 sm:flex sm:items-end sm:justify-between sm:gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-cyan-600 dark:text-cyan-300">
                Период подписки
              </p>
              <h3 className="mt-1 text-base font-semibold text-slate-950 dark:text-white">Выберите удобный срок</h3>
            </div>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 sm:mt-0 sm:text-right">
              Дольше срок, ниже стоимость дня
            </p>
          </div>

          <div className="grid gap-2" role="radiogroup" aria-label="Выбор тарифа">
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
                    'group grid w-full min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-3 rounded-[1.2rem] border px-3.5 py-3.5 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center sm:px-4 sm:py-4',
                    selected
                      ? 'border-cyan-300 bg-white shadow-sm shadow-cyan-950/[0.04] dark:border-cyan-400/40 dark:bg-white/[0.07]'
                      : 'border-transparent bg-white/55 hover:border-slate-200 hover:bg-white dark:bg-white/[0.02] dark:hover:border-white/10 dark:hover:bg-white/[0.05]'
                  )}
                >
                  <span
                    className={cn(
                      'mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full border transition-colors sm:mt-0',
                      selected
                        ? 'border-cyan-500 bg-cyan-500 text-white'
                        : 'border-slate-300 bg-white text-transparent group-hover:border-slate-400 dark:border-white/20 dark:bg-white/[0.03]'
                    )}
                    aria-hidden="true"
                  >
                    <Check className="h-3.5 w-3.5" />
                  </span>

                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span className="break-words text-sm font-semibold text-slate-950 dark:text-white sm:text-base">{plan.name}</span>
                      {plan.current ? <PlanPickerBadge>Текущий</PlanPickerBadge> : null}
                      {!plan.current && plan.popular ? <PlanPickerBadge>Популярный</PlanPickerBadge> : null}
                      {plan.savingsPercent > 0 && !plan.isPromo ? <PlanPickerBadge>−{plan.savingsPercent}%</PlanPickerBadge> : null}
                    </span>
                    <span className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                      <span>{plan.durationDays} дней</span>
                      <span>{plan.trafficLimitGb == null ? 'Безлимитный трафик' : `${plan.trafficLimitGb} ГБ`}</span>
                      <span>До {plan.deviceLimit} устройств</span>
                    </span>
                  </span>

                  <span className="col-span-2 flex items-end justify-between gap-3 pl-9 sm:col-span-1 sm:block sm:pl-0 sm:text-right">
                    <span className="text-xs text-slate-400 dark:text-slate-500 sm:block">{dailyRateLabel(plan)}</span>
                    <span className="block whitespace-nowrap text-xl font-semibold tracking-tight tabular-nums text-slate-950 dark:text-white sm:mt-1">
                      {plan.price}
                    </span>
                  </span>
                </button>
              )
            })}
          </div>

          <div className="mt-auto flex items-start gap-2.5 rounded-2xl bg-white/70 px-3.5 py-3 text-xs leading-5 text-slate-500 ring-1 ring-slate-200/70 dark:bg-white/[0.025] dark:text-slate-400 dark:ring-white/[0.07]">
            <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-cyan-400" />
            <span>Цена фиксирована за весь выбранный срок. Доступ активируется автоматически после подтверждения оплаты.</span>
          </div>
        </div>

        <div className="min-w-0">
          {activePlan ? <PlanCard key={activePlan.id} {...activePlan} /> : null}
        </div>
      </div>

      {mobileCheckoutPlan ? createPortal(
        <div className="fixed inset-0 z-[110] xl:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-slate-950/65 backdrop-blur-sm"
            aria-label="Закрыть окно оплаты"
            onClick={() => setMobileCheckoutPlanId(null)}
          />
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="mobile-checkout-title"
            className="absolute inset-x-0 bottom-0 max-h-[92dvh] overflow-y-auto rounded-t-[2rem] border-t border-slate-200 bg-white shadow-2xl dark:border-white/[0.1] dark:bg-surface-950"
          >
            <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-slate-100 bg-white/95 px-4 py-3.5 backdrop-blur dark:border-white/[0.08] dark:bg-surface-950/95">
              <div>
                <h2 id="mobile-checkout-title" className="font-semibold tracking-tight text-slate-950 dark:text-white">Оплата тарифа</h2>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">Выберите способ оплаты и подтвердите</p>
              </div>
              <button
                type="button"
                autoFocus
                className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-500 transition-colors hover:bg-slate-200 hover:text-slate-950 dark:bg-white/[0.07] dark:text-slate-300 dark:hover:bg-white/[0.11] dark:hover:text-white"
                aria-label="Закрыть"
                onClick={() => setMobileCheckoutPlanId(null)}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="px-4 pt-4">
              <PlanCard key={mobileCheckoutPlan.id} {...mobileCheckoutPlan} display="checkout" />
            </div>
          </section>
        </div>,
        document.body,
      ) : null}
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

function dailyRateLabel(plan: CatalogPlan) {
  if (plan.isPromo || plan.priceKopecks <= 0) return 'Бесплатно'
  const dailyPrice = Math.round(plan.priceKopecks / Math.max(1, plan.durationDays))
  return `${formatPrice(dailyPrice)} в день`
}

function mobileCtaLabel(plan: CatalogPlan) {
  if (plan.isPromo) return 'Активировать'
  if (plan.current) return 'Продлить'
  return 'Оплатить'
}
