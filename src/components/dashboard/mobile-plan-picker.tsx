'use client'

import type { ReactNode } from 'react'
import { useMemo, useState } from 'react'
import { ArrowRight, Check } from 'lucide-react'
import { cn } from '@/lib/cn'
import { formatPrice } from '@/lib/format'
import { Modal } from '@/components/ui/modal'
import { PlanCard, type PlanCardProps } from './plan-card'
import styles from './plan-catalog.module.css'

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
    <section className={styles.catalog} aria-label="Выбор тарифа">
      <div className={styles.heading}>
        <div><span className={styles.eyebrow}>01 / Тариф</span><h2>Выберите свой вариант</h2></div>
        <p>Стоимость указана за весь срок.<br />Количество устройств уточните перед оплатой.</p>
      </div>

      <div className={styles.layout}>
        <div>
          <div className={styles.mobileList}>
            {orderedPlans.map((plan) => (
              <article key={plan.id} className={cn(styles.option, plan.current && styles.current)}>
                <PlanOptionDetails plan={plan} />
                <div className={styles.mobilePrice}>
                  <span><strong>{displayPlanPrice(plan)}</strong><small>{dailyRateLabel(plan)}</small></span>
                  <button
                    type="button"
                    aria-haspopup="dialog"
                    onClick={() => setMobileCheckoutPlanId(plan.id)}
                    disabled={!plan.isPromo && plan.paymentProviders?.length === 0}
                    className={styles.choose}
                  >
                    {mobileCtaLabel(plan)}<ArrowRight className="h-4 w-4" />
                  </button>
                </div>
              </article>
            ))}
          </div>

          <div className={styles.desktopList} role="radiogroup" aria-label="Выбор тарифа">
            {orderedPlans.map((plan) => {
              const selected = plan.id === activePlanId
              return (
                <button
                  key={plan.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setSelectedPlanId(plan.id)}
                  onKeyDown={(event) => {
                    const offset = ['ArrowRight', 'ArrowDown'].includes(event.key) ? 1 : ['ArrowLeft', 'ArrowUp'].includes(event.key) ? -1 : 0
                    if (!offset && !['Home', 'End'].includes(event.key)) return
                    event.preventDefault()
                    const index = orderedPlans.findIndex((item) => item.id === plan.id)
                    const nextIndex = event.key === 'Home' ? 0 : event.key === 'End' ? orderedPlans.length - 1 : (index + offset + orderedPlans.length) % orderedPlans.length
                    setSelectedPlanId(orderedPlans[nextIndex]!.id)
                    event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[nextIndex]?.focus()
                  }}
                  tabIndex={selected ? 0 : -1}
                  className={cn(styles.option, selected && styles.selected)}
                >
                  <span className={styles.optionTop}>
                    <span className={styles.radio} aria-hidden="true">{selected ? <Check className="h-3 w-3" /> : null}</span>
                    <span className={styles.price}><strong>{displayPlanPrice(plan)}</strong><small>{dailyRateLabel(plan)}</small></span>
                  </span>
                  <PlanOptionDetails plan={plan} />
                </button>
              )
            })}
          </div>
          <p className={styles.footnote}>Дополнительные устройства и опции рассчитываются отдельно. Полную сумму покажем до перехода к оплате.</p>
        </div>
        <div className={styles.checkout}>
          <div className={styles.checkoutHeading}><span className={styles.eyebrow}>02 / Настройка</span><h2>Ваша подписка</h2></div>
          {activePlan ? <div key={activePlan.id}><PlanCard {...activePlan} /></div> : null}
        </div>
      </div>

      <Modal
        open={Boolean(mobileCheckoutPlan)}
        title="Оформление подписки"
        description="Выберите устройства и проверьте полную стоимость"
        variant="sheet"
        overlayClassName="min-[1360px]:hidden"
        panelClassName="sm:max-w-[32rem]"
        bodyClassName="px-4 pb-1 pt-3 sm:px-5"
        onClose={() => setMobileCheckoutPlanId(null)}
      >
        {mobileCheckoutPlan ? <div key={mobileCheckoutPlan.id}><PlanCard {...mobileCheckoutPlan} display="checkout" /></div> : null}
      </Modal>
    </section>
  )
}

function PlanOptionDetails({ plan }: { plan: CatalogPlan }) {
  return (
    <span className={styles.details}>
      <span className={styles.badges}>
        {plan.current ? <PlanPickerBadge>Текущий тариф</PlanPickerBadge> : plan.popular ? <PlanPickerBadge>Популярный</PlanPickerBadge> : null}
        {plan.isPromo ? <PlanPickerBadge>Пробный</PlanPickerBadge> : automaticDiscountPercent(plan) > 0 ? <PlanPickerBadge>Ваша скидка −{automaticDiscountPercent(plan)}%</PlanPickerBadge> : null}
      </span>
      <span className={styles.duration}>{plan.unlimitedDuration ? 'Бессрочно' : `${plan.durationDays} ${dayLabel(plan.durationDays)}`}</span>
      <span className={styles.name}>{plan.name}</span>
      <span className={styles.facts}>
        <span>{plan.unlimitedDevices ? 'Безлимит устройств' : `Включено устройств: ${plan.deviceLimit}`}</span>
        <span>{plan.trafficLimitGb == null ? 'Безлимитный трафик' : `${plan.trafficLimitGb} ГБ трафика`}</span>
      </span>
    </span>
  )
}

function PlanPickerBadge({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-[5px] bg-brand-50 px-1.5 py-0.5 font-mono text-xs font-semibold uppercase text-brand-700 dark:bg-brand-500/10 dark:text-brand-300">
      {children}
    </span>
  )
}

function dailyRateLabel(plan: CatalogPlan) {
  if (plan.isPromo || plan.priceKopecks <= 0) return 'Бесплатно'
  if (plan.unlimitedDuration) return 'Разовая оплата'
  const dailyPrice = Math.round(discountedPlanPriceKopecks(plan) / Math.max(1, plan.durationDays))
  return `${formatPrice(dailyPrice)} в день`
}

function automaticDiscountPercent(plan: CatalogPlan) {
  return Math.max(plan.personalDiscountPercent ?? 0, plan.nextPurchaseDiscountPercent ?? 0)
}

function discountedPlanPriceKopecks(plan: CatalogPlan) {
  const percent = automaticDiscountPercent(plan)
  if (percent <= 0 || plan.priceKopecks <= 100) return plan.priceKopecks
  const discount = Math.min(
    Math.floor((plan.priceKopecks * percent) / 100),
    plan.priceKopecks - 100
  )
  return plan.priceKopecks - discount
}

function displayPlanPrice(plan: CatalogPlan) {
  return formatPrice(discountedPlanPriceKopecks(plan))
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
  return 'Выбрать'
}
