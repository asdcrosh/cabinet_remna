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
import { ArrowRight, MessageCircleQuestion, RefreshCw, ShieldCheck } from 'lucide-react'

export const dynamic = 'force-dynamic'

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
        description="Выберите период подписки."
        action={(
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            {canManagePlans && (
              <>
                <Link href="/dashboard/admin/plans" className="hidden xl:inline-flex btn-secondary">
                  Управлять тарифами
                </Link>
                <Link href="/dashboard/admin/plans" className="inline-flex min-h-9 items-center text-sm font-medium text-slate-500 transition-colors hover:text-slate-950 dark:text-slate-400 dark:hover:text-white xl:hidden">
                  Управление
                  <ArrowRight className="ml-1 h-3.5 w-3.5" />
                </Link>
              </>
            )}
          </div>
        )}
      />

      {isRenewIntent && (
        <section className="flex items-start gap-3 rounded-[1.5rem] border border-cyan-200/80 bg-cyan-50/70 px-4 py-3.5 text-sm text-cyan-950 dark:border-cyan-400/25 dark:bg-cyan-400/[0.08] dark:text-cyan-50">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-white/80 text-cyan-700 shadow-sm ring-1 ring-cyan-200/80 dark:bg-cyan-300/10 dark:text-cyan-100 dark:ring-cyan-300/15">
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
        <div className="flex flex-col gap-3 rounded-[1.5rem] border border-amber-200/80 bg-amber-50/70 px-4 py-3.5 text-sm text-amber-900 dark:border-amber-500/25 dark:bg-amber-500/[0.08] dark:text-amber-100 sm:flex-row sm:items-center sm:justify-between">
          <span className="flex min-w-0 items-center gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-white/80 shadow-sm ring-1 ring-amber-200/80 dark:bg-amber-300/10 dark:ring-amber-300/15">
              <MessageCircleQuestion className="h-5 w-5" />
            </span>
            <span className="min-w-0">
              <span className="block font-semibold">Доступен пробный тариф</span>
              <span className="mt-0.5 block text-xs leading-5 text-amber-800/80 dark:text-amber-100/70">Сначала подтвердите аккаунт через Telegram.</span>
            </span>
          </span>
          <Link href="/dashboard/settings" className="inline-flex min-h-10 shrink-0 items-center justify-center gap-1.5 rounded-xl bg-white px-3 font-semibold text-amber-900 shadow-sm ring-1 ring-amber-200/80 transition-colors hover:bg-amber-100 dark:bg-amber-300/10 dark:text-amber-100 dark:ring-amber-300/15 dark:hover:bg-amber-300/15">
            Перейти к проверке
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      )}

      {planViews.length > 0 ? (
        <PlanCatalog
          key={`${currentSubscription?.planId ?? 'none'}:${linkedPlanId ?? ''}`}
          plans={planViews}
          initialPlanId={linkedPlanId}
        />
      ) : null}

      {planViews.length === 0 && (
        <div className="rounded-[1.75rem] border border-slate-200/80 bg-white px-4 py-10 text-center dark:border-white/[0.08] dark:bg-white/[0.025] sm:px-6 sm:py-12">
          <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-cyan-50 text-cyan-700 ring-1 ring-cyan-200/70 dark:bg-cyan-400/10 dark:text-cyan-200 dark:ring-cyan-400/20">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <h3 className="text-lg font-semibold">Тарифы скоро появятся</h3>
          <p className="mx-auto mt-2 max-w-md text-sm text-slate-500 dark:text-slate-400">Сейчас нет опубликованных тарифов.</p>
          {canManagePlans && (
            <Link href="/dashboard/admin/plans" className="btn-primary mt-5 inline-flex">Создать тариф</Link>
          )}
        </div>
      )}
    </div>
  )
}
