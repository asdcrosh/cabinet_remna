'use client'

import type { ReactNode } from 'react'
import { useMemo, useState } from 'react'
import { ArrowRight, Check, Sparkles } from 'lucide-react'
import { cn } from '@/lib/cn'
import { formatPrice } from '@/lib/format'
import { Modal } from '@/components/ui/modal'
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

  if (orderedPlans.length === 0) return null

  return (
    <section className="plan-catalog relative overflow-hidden rounded-[1.5rem] border border-slate-200/80 bg-white p-4 shadow-[0_18px_50px_-32px_rgba(15,23,42,0.38)] dark:border-white/[0.09] dark:bg-white/[0.035] sm:p-5" aria-label="Выбор тарифа">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-fuchsia-500/[0.06] to-transparent dark:from-fuchsia-400/[0.08]" />
      <div className="plan-catalog__heading relative mb-5 hidden flex-wrap items-end justify-between gap-3 min-[1360px]:flex">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-fuchsia-500/10 text-fuchsia-600 ring-1 ring-fuchsia-500/15 dark:text-fuchsia-300">
            <Sparkles className="h-4 w-4" />
          </span>
          <div>
            <div className="page-eyebrow">Срок подписки</div>
            <h2 className="text-xl font-semibold tracking-[-0.035em] text-slate-950 dark:text-white">Выберите период</h2>
          </div>
        </div>
        <span className="shrink-0 rounded-full border border-fuchsia-200/80 bg-fuchsia-50/80 px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] tabular-nums text-fuchsia-700 dark:border-fuchsia-400/15 dark:bg-fuchsia-400/10 dark:text-fuchsia-200">
          {orderedPlans.length} {planCountLabel(orderedPlans.length)}
        </span>
      </div>

      <div className="plan-catalog__compact-heading relative mb-4 flex items-center justify-between gap-3 min-[1360px]:hidden">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-fuchsia-500/10 text-fuchsia-600 ring-1 ring-fuchsia-500/15 dark:text-fuchsia-300">
            <Sparkles className="h-4 w-4" />
          </span>
          <div>
            <div className="page-eyebrow">Срок подписки</div>
            <h2 className="text-lg font-semibold tracking-[-0.035em] text-slate-950 dark:text-white">Выберите период</h2>
          </div>
        </div>
        <span className="shrink-0 rounded-full border border-fuchsia-200/80 bg-fuchsia-50/80 px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] tabular-nums text-fuchsia-700 dark:border-fuchsia-400/15 dark:bg-fuchsia-400/10 dark:text-fuchsia-200">
          {orderedPlans.length} {planCountLabel(orderedPlans.length)}
        </span>
      </div>

      <div className="plan-period-list relative grid gap-2.5 min-[1360px]:hidden">
        {orderedPlans.map((plan, index) => (
          <article
            key={plan.id}
            className={cn(
              'plan-period-card relative grid min-h-0 min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 rounded-2xl border border-slate-200 bg-white/70 px-3 py-3.5 dark:border-white/[0.08] dark:bg-white/[0.025] sm:px-4',
              plan.current
                ? 'plan-period-card--current'
                : ''
            )}
          >
            <div className="flex min-w-0 items-start gap-3">
              <span className="plan-period-card__index" aria-hidden="true">
                {String(index + 1).padStart(2, '0')}
              </span>
              <div className="min-w-0">
                <h3 className="text-xl font-semibold leading-none tracking-[-0.045em] text-slate-950 dark:text-white">
                  {plan.durationDays}
                  {' '}
                  <span className="ml-1 text-sm font-medium tracking-normal text-slate-500 dark:text-slate-400">
                    {dayLabel(plan.durationDays)}
                  </span>
                </h3>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">{plan.name}</p>
                  {plan.current ? <PlanPickerBadge>Текущий</PlanPickerBadge> : null}
                  {!plan.current && plan.popular ? <PlanPickerBadge>Выбор</PlanPickerBadge> : null}
                  {plan.savingsPercent > 0 && !plan.isPromo ? <PlanPickerBadge>−{plan.savingsPercent}%</PlanPickerBadge> : null}
                </div>
              </div>
            </div>

            <div className="min-w-[7.6rem] text-right">
              <div className="mb-2">
                <span className="block whitespace-nowrap text-lg font-semibold tracking-[-0.03em] tabular-nums text-slate-950 dark:text-white">
                  {plan.maxDeviceLimit > plan.deviceLimit ? `от ${plan.price}` : plan.price}
                </span>
                <span className="mt-0.5 block text-[10px] text-slate-500 dark:text-slate-400">{dailyRateLabel(plan)}</span>
              </div>
              <button
                type="button"
                aria-haspopup="dialog"
                onClick={() => setMobileCheckoutPlanId(plan.id)}
                disabled={!plan.isPromo && plan.paymentProviders?.length === 0}
                className={cn(
                  'plan-period-card__action group inline-flex min-h-9 w-full items-center justify-between gap-1 border px-3 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50',
                  plan.current
                    ? 'border-brand-600 bg-brand-600 text-white hover:bg-brand-700 dark:border-brand-400 dark:bg-brand-400 dark:text-white dark:hover:bg-brand-300'
                    : 'border-slate-300 bg-transparent text-slate-800 hover:border-slate-950 dark:border-white/15 dark:text-white dark:hover:border-white/40'
                )}
              >
                {mobileCtaLabel(plan)}
                <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
              </button>
            </div>
          </article>
        ))}
      </div>

      <div className="relative hidden gap-5 min-[1360px]:grid min-[1360px]:grid-cols-2 min-[1360px]:items-start">
        <div className="plan-period-panel flex flex-col border p-4">
          <div className="mb-3 px-1 sm:flex sm:items-end sm:justify-between sm:gap-4">
            <div>
              <h3 className="text-base font-semibold text-slate-950 dark:text-white">Период подписки</h3>
            </div>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 sm:mt-0 sm:text-right">
              Дольше срок, ниже стоимость дня
            </p>
          </div>

          <div className="grid gap-2" role="radiogroup" aria-label="Выбор тарифа">
            {orderedPlans.map((plan, index) => {
              const selected = plan.id === activePlanId
              return (
                <button
                  key={plan.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setSelectedPlanId(plan.id)}
                  className={cn(
                    'group grid w-full min-w-0 grid-cols-[2rem_minmax(0,1fr)] gap-3 border px-3.5 py-3.5 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 sm:grid-cols-[2rem_minmax(0,1fr)_auto] sm:items-center sm:px-4 sm:py-4',
                    selected
                      ? 'border-slate-200 bg-white dark:border-white/10 dark:bg-white/[0.05]'
                      : 'border-transparent bg-white/55 hover:border-slate-200 hover:bg-white dark:bg-white/[0.015] dark:hover:border-white/10 dark:hover:bg-white/[0.04]'
                  )}
                >
                  <span className="plan-choice-index" aria-hidden="true">
                    {selected ? <Check className="h-3.5 w-3.5" /> : String(index + 1).padStart(2, '0')}
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
                      <span>
                        {plan.maxDeviceLimit > plan.deviceLimit
                          ? `${plan.deviceLimit}–${plan.maxDeviceLimit} устройств`
                          : `До ${plan.deviceLimit} устройств`}
                      </span>
                    </span>
                  </span>

                  <span className="col-span-2 flex items-end justify-between gap-3 pl-11 sm:col-span-1 sm:block sm:pl-0 sm:text-right">
                    <span className="text-xs text-slate-400 dark:text-slate-500 sm:block">{dailyRateLabel(plan)}</span>
                    <span className="block whitespace-nowrap text-xl font-semibold tracking-tight tabular-nums text-slate-950 dark:text-white sm:mt-1">
                      {plan.maxDeviceLimit > plan.deviceLimit ? `от ${plan.price}` : plan.price}
                    </span>
                  </span>
                </button>
              )
            })}
          </div>

          <div className="mt-4 flex items-start gap-2.5 border-t border-slate-200/90 px-1 pt-3 text-xs leading-5 text-slate-500 dark:border-white/[0.09] dark:text-slate-400">
            <span className="mt-0.5 h-3 w-0.5 shrink-0 bg-cyan-400" />
            <span>Цена фиксирована за весь выбранный срок. Доступ активируется автоматически после подтверждения оплаты.</span>
          </div>
        </div>

        <div className="min-w-0" aria-live="polite">
          {activePlan ? (
            <div key={activePlan.id} className="plan-checkout-transition">
              <PlanCard {...activePlan} />
            </div>
          ) : null}
        </div>
      </div>

      <Modal
        open={Boolean(mobileCheckoutPlan)}
        title="Оформление подписки"
        description="Проверьте срок, сумму и выберите способ оплаты"
        variant="sheet"
        overlayClassName="min-[1360px]:hidden"
        panelClassName="sm:max-w-[32rem]"
        bodyClassName="px-4 pb-1 pt-3 sm:px-5"
        onClose={() => setMobileCheckoutPlanId(null)}
      >
        {mobileCheckoutPlan ? (
          <div key={mobileCheckoutPlan.id} className="plan-checkout-transition">
            <PlanCard {...mobileCheckoutPlan} display="checkout" />
          </div>
        ) : null}
      </Modal>
    </section>
  )
}

function PlanPickerBadge({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-[5px] bg-brand-50 px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase text-brand-700 dark:bg-brand-500/10 dark:text-brand-300">
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

function dayLabel(days: number) {
  const lastTwo = days % 100
  if (lastTwo >= 11 && lastTwo <= 14) return 'дней'
  const last = days % 10
  if (last === 1) return 'день'
  if (last >= 2 && last <= 4) return 'дня'
  return 'дней'
}

function mobileCtaLabel(plan: CatalogPlan) {
  if (plan.isPromo) return 'Активировать'
  if (plan.current) return 'Продлить'
  return 'Оплатить'
}
