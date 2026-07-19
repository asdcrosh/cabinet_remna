// /dashboard/plans — выбор тарифа. Серверный компонент: планы
// подтянем напрямую из Prisma (не из /api/plans, чтобы не ходить самому к себе).

import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { PlanCatalog } from '@/components/dashboard/mobile-plan-picker'
import { formatPrice } from '@/lib/format'
import { PageHeader } from '@/components/dashboard/page-header'
import { getCurrentUser } from '@/lib/auth/cookies'
import { getPlanAudienceContext, isPlanAvailableForUser } from '@/lib/plan-access'
import { getAvailableUserPromoCodesByPlan } from '@/lib/user-promo-codes'
import { getAvailablePaymentProviders } from '@/lib/payment-providers'
import { ArrowRight, ChevronDown, MessageCircleQuestion, RefreshCw, ShieldCheck } from 'lucide-react'

export const revalidate = 300 // кэш на 5 минут

export default async function PlansPage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string; promo?: string; intent?: string }>
}) {
  const params = await searchParams
  const paymentProviders = await getAvailablePaymentProviders()
  const session = await getCurrentUser()
  const linkedPlanId = params.plan?.trim()
  const initialPromoCode = params.promo?.trim()
  const isRenewIntent = params.intent === 'renew'
  const plans = await prisma.plan.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: 'asc' },
  })
  const user = session
    ? await prisma.user.findUnique({
        where: { id: session.uid },
        select: {
          role: true,
          telegramId: true,
          remnashopUserId: true,
          remnashopSyncedAt: true,
          remnawaveUuid: true,
        },
      })
    : null
  const canManagePlans = user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN'
  const audienceContext = session ? await getPlanAudienceContext(session.uid) : null
  const usedTrialPlanIds = session
    ? new Set(
        (
          await prisma.trialPlanRedemption.findMany({
            where: {
              userId: session.uid,
              payment: { subscriptionProvisionedAt: { not: null } },
            },
            select: { planId: true },
          })
        ).map((redemption) => redemption.planId)
      )
    : new Set<string>()
  const currentSubscription = session
    ? await prisma.subscription.findFirst({
        where: { userId: session.uid, status: { in: ['ACTIVE', 'LIMITED'] } },
        orderBy: { expireAt: 'desc' },
      })
    : null
  const hasAnySubscription = session
    ? (await prisma.subscription.count({ where: { userId: session.uid } })) > 0
    : false
  const canUsePromo =
    Boolean(user?.telegramId) &&
    Boolean(user?.remnashopSyncedAt) &&
    !usedTrialPlanIds.size &&
    !hasAnySubscription &&
    !user?.remnashopUserId &&
    !user?.remnawaveUuid
  const audiencePlans = audienceContext
    ? plans.filter((plan) =>
        isPlanAvailableForUser(plan, audienceContext, {
          allowLink: plan.availability === 'LINK' && plan.id === linkedPlanId,
        })
      )
    : plans.filter((plan) => plan.availability === 'ALL')
  const visiblePlans = audiencePlans.filter((plan) => !plan.isPromo || canUsePromo)
  const availablePromoCodesByPlan = session
    ? await getAvailableUserPromoCodesByPlan({ userId: session.uid, plans: visiblePlans, linkPromoCode: initialPromoCode })
    : new Map()
  const hasPromoPlan = audiencePlans.some((plan) => plan.isPromo)
  const isOtherwiseEligibleForPromo =
    !usedTrialPlanIds.size &&
    !hasAnySubscription &&
    !user?.remnashopUserId &&
    !user?.remnawaveUuid
  const needsTelegramCheckForPromo =
    hasPromoPlan &&
    isOtherwiseEligibleForPromo &&
    (!user?.telegramId || !user?.remnashopSyncedAt)
  const referencePlan = visiblePlans
    .filter((plan) => !plan.isPromo && plan.priceKopecks > 0)
    .sort((a, b) => a.durationDays - b.durationDays)[0]
  const referenceDailyPrice = referencePlan
    ? referencePlan.priceKopecks / Math.max(1, referencePlan.durationDays)
    : 0
  const planViews = visiblePlans.map((plan) => ({
    id: plan.id,
    name: plan.name,
    description: plan.description,
    price: formatPrice(plan.priceKopecks),
    priceKopecks: plan.priceKopecks,
    monthlyPrice: formatPrice(Math.round((plan.priceKopecks / Math.max(1, plan.durationDays)) * 30)),
    savingsPercent: !plan.isPromo && referenceDailyPrice > 0
      ? Math.max(0, Math.round((1 - (plan.priceKopecks / Math.max(1, plan.durationDays)) / referenceDailyPrice) * 100))
      : 0,
    durationDays: plan.durationDays,
    trafficLimitGb: plan.trafficLimitGb,
    deviceLimit: plan.deviceLimit,
    isPromo: plan.isPromo,
    promoCodesEnabled: plan.promoCodesEnabled,
    popular: plan.isFeatured,
    current: currentSubscription?.planId === plan.id,
    initialPromoCode,
    availablePromoCodes: availablePromoCodesByPlan.get(plan.id) ?? [],
    paymentProviders,
  }))

  return (
    <div className="page-stack">
      <PageHeader
        title="Тарифы"
        description="Выберите подходящий срок. Доступ обновится автоматически после оплаты."
        action={(
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            {canManagePlans && (
              <Link href="/dashboard/admin/plans" className="btn-secondary">
                Управлять тарифами
              </Link>
            )}
          </div>
        )}
      />

      {isRenewIntent && (
        <section className="flex items-start gap-3 rounded-2xl border border-cyan-200 bg-cyan-50/80 px-4 py-3.5 text-sm text-cyan-950 dark:border-cyan-400/30 dark:bg-cyan-400/10 dark:text-cyan-50">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-cyan-100 text-cyan-700 dark:bg-cyan-300/10 dark:text-cyan-100">
            <RefreshCw className="h-4 w-4" />
          </span>
          <div className="min-w-0 pt-0.5">
            <div className="font-semibold">Продление подписки</div>
            <div className="mt-1 leading-5 text-cyan-900/75 dark:text-cyan-50/75">
              Можно выбрать текущий или другой тариф. Оплаченный срок добавится автоматически.
            </div>
          </div>
        </section>
      )}

      {needsTelegramCheckForPromo && (
        <div className="flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50/80 px-4 py-3.5 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100 sm:flex-row sm:items-center sm:justify-between">
          <span className="flex min-w-0 items-center gap-3">
            <MessageCircleQuestion className="h-5 w-5 shrink-0" />
            <span>Пробный тариф откроется после проверки Telegram.</span>
          </span>
          <Link href="/dashboard/settings" className="inline-flex min-h-9 shrink-0 items-center justify-center gap-1.5 rounded-xl bg-amber-100 px-3 font-semibold text-amber-900 transition-colors hover:bg-amber-200 dark:bg-amber-300/10 dark:text-amber-100 dark:hover:bg-amber-300/15">
            Проверить
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      )}

      {planViews.length > 0 ? <PlanCatalog plans={planViews} initialPlanId={linkedPlanId} /> : null}

      {planViews.length === 0 && (
        <div className="card py-10 text-center sm:py-12">
          <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-cyan-50 text-cyan-700 dark:bg-cyan-400/10 dark:text-cyan-200">
            <ShieldCheck className="h-7 w-7" />
          </div>
          <h3 className="text-lg font-semibold">Тарифы скоро появятся</h3>
          <p className="mx-auto mt-2 max-w-md text-sm text-slate-500 dark:text-slate-400">Сейчас нет опубликованных тарифов.</p>
          {canManagePlans && (
            <Link href="/dashboard/admin/plans" className="btn-primary mt-5 inline-flex">Создать тариф</Link>
          )}
        </div>
      )}

      {visiblePlans.length > 1 ? <PlanComparison plans={visiblePlans} /> : null}
    </div>
  )
}

function PlanComparison({ plans }: { plans: Array<{ id: string; name: string; priceKopecks: number; durationDays: number; trafficLimitGb: number | null; deviceLimit: number }> }) {
  return (
    <details className="group overflow-hidden rounded-3xl border border-slate-200 bg-white dark:border-white/10 dark:bg-white/[0.035]">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-4 text-sm font-semibold text-slate-950 transition-colors hover:bg-slate-50 dark:text-white dark:hover:bg-white/[0.025] sm:px-5 [&::-webkit-details-marker]:hidden">
        <span>Сравнить характеристики</span>
        <ChevronDown className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-open:rotate-180" />
      </summary>
      <div
        role="region"
        aria-label="Сравнение тарифов с горизонтальной прокруткой"
        tabIndex={0}
        className="overflow-x-auto border-t border-slate-100 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-cyan-400 dark:border-white/10"
      >
        <table className="w-full min-w-[680px] text-sm">
          <caption className="sr-only">Сравнение срока, трафика, устройств и цены тарифов</caption>
          <thead className="bg-slate-50 text-left text-slate-500 dark:bg-surface-800">
            <tr>
              <th className="px-4 py-3">Тариф</th>
              <th className="px-4 py-3">Срок</th>
              <th className="px-4 py-3">Трафик</th>
              <th className="px-4 py-3">Устройства</th>
              <th className="px-4 py-3 text-right">Цена</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-white/10">
            {plans.map((plan) => (
              <tr key={plan.id} className="transition-colors hover:bg-slate-50/70 dark:hover:bg-white/[0.025]">
                <td className="px-4 py-3 font-medium">{plan.name}</td>
                <td className="px-4 py-3 text-slate-500">{plan.durationDays} дн.</td>
                <td className="px-4 py-3 text-slate-500">{plan.trafficLimitGb == null ? 'Безлимит' : `${plan.trafficLimitGb} ГБ`}</td>
                <td className="px-4 py-3 text-slate-500">{plan.deviceLimit}</td>
                <td className="px-4 py-3 text-right font-semibold">{formatPrice(plan.priceKopecks)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  )
}
