// /dashboard/plans — выбор тарифа. Серверный компонент: планы
// подтянем напрямую из Prisma (не из /api/plans, чтобы не ходить самому к себе).

import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { PlanCard } from '@/components/dashboard/plan-card'
import { MobilePlanPicker } from '@/components/dashboard/mobile-plan-picker'
import { formatPrice } from '@/lib/format'
import { PageHeader } from '@/components/dashboard/page-header'
import { getCurrentUser } from '@/lib/auth/cookies'
import { CreditCard, KeyRound, ShieldCheck } from 'lucide-react'
import { getPlanAudienceContext, isPlanAvailableForUser } from '@/lib/plan-access'
import { getAvailableUserPromoCodesByPlan } from '@/lib/user-promo-codes'

export const revalidate = 300 // кэш на 5 минут

export default async function PlansPage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string; promo?: string; intent?: string }>
}) {
  const params = await searchParams
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
    shortPrice: formatPrice(plan.priceKopecks),
    priceKopecks: plan.priceKopecks,
    monthlyPrice: formatPrice(Math.round((plan.priceKopecks / Math.max(1, plan.durationDays)) * 30)),
    savingsPercent: !plan.isPromo && referenceDailyPrice > 0
      ? Math.max(0, Math.round((1 - (plan.priceKopecks / Math.max(1, plan.durationDays)) / referenceDailyPrice) * 100))
      : 0,
    durationDays: plan.durationDays,
    trafficLimitGb: plan.trafficLimitGb,
    deviceLimit: plan.deviceLimit,
    isPromo: plan.isPromo,
    popular: plan.isFeatured,
    current: currentSubscription?.planId === plan.id,
    initialPromoCode,
    availablePromoCodes: availablePromoCodesByPlan.get(plan.id) ?? [],
  }))

  return (
    <div className="page-stack">
      <PageHeader
        title="Тарифы"
        description="Выберите срок доступа. Подписка активируется сразу после оплаты."
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

      <section aria-label="Как подключиться" className="grid grid-cols-3 gap-1 rounded-2xl border border-slate-200/80 bg-white/75 p-1.5 shadow-sm shadow-slate-950/[0.03] dark:border-white/10 dark:bg-white/[0.025] sm:gap-2 sm:p-2">
        <BuyStep icon={<ShieldCheck className="h-4 w-4" />} title="Выберите" subtitle="тариф" />
        <BuyStep icon={<CreditCard className="h-4 w-4" />} title="Оплатите" subtitle="онлайн" />
        <BuyStep icon={<KeyRound className="h-4 w-4" />} title="Подключите" subtitle="устройство" />
      </section>

      {isRenewIntent && (
        <section className="rounded-2xl border border-cyan-200 bg-cyan-50/80 px-4 py-3 text-sm text-cyan-950 shadow-sm dark:border-cyan-400/30 dark:bg-cyan-400/10 dark:text-cyan-50">
          <div className="font-semibold">Продление подписки</div>
          <div className="mt-1 text-cyan-900/75 dark:text-cyan-50/75">
            Выберите текущий или любой другой тариф. После оплаты срок доступа обновится автоматически.
          </div>
        </section>
      )}

      {needsTelegramCheckForPromo && (
        <div className="flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm text-amber-900 shadow-sm dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100 sm:flex-row sm:items-center sm:justify-between">
          <span>Пробный тариф откроется после проверки Telegram.</span>
          <Link href="/dashboard/settings" className="btn-secondary h-10 shrink-0 px-4 text-sm">
            Проверить Telegram
          </Link>
        </div>
      )}

      {planViews.length > 0 ? (
        <MobilePlanPicker plans={planViews} initialPlanId={linkedPlanId} />
      ) : null}

      <div className="hidden gap-5 md:grid md:auto-rows-fr md:grid-cols-2 xl:grid-cols-3">
        {planViews.length === 0 && (
          <div className="card w-full py-12 text-center md:col-span-full">
            <h3 className="text-lg font-semibold">Тарифы скоро появятся</h3>
            <p className="mx-auto mt-2 max-w-md text-sm text-slate-500 dark:text-slate-400">
              Сейчас нет опубликованных тарифов.
            </p>
            {canManagePlans && (
              <Link href="/dashboard/admin/plans" className="btn-primary mt-5 inline-flex">
                Создать тариф
              </Link>
            )}
          </div>
        )}
        {planViews.map((plan) => (
          <div key={plan.id} className="min-w-0">
            <PlanCard {...plan} />
          </div>
        ))}
      </div>

      {planViews.length === 0 && (
        <div className="card py-10 text-center md:hidden">
          <h3 className="text-lg font-semibold">Тарифы скоро появятся</h3>
          <p className="mx-auto mt-2 max-w-md text-sm text-slate-500 dark:text-slate-400">Сейчас нет опубликованных тарифов.</p>
        </div>
      )}

      {visiblePlans.length > 1 ? <PlanComparison plans={visiblePlans} /> : null}
    </div>
  )
}

function PlanComparison({ plans }: { plans: Array<{ id: string; name: string; priceKopecks: number; durationDays: number; trafficLimitGb: number | null; deviceLimit: number }> }) {
  return (
    <details className="overflow-hidden rounded-2xl border border-slate-200 bg-white/90 shadow-sm dark:border-white/10 dark:bg-surface-900">
      <summary className="cursor-pointer px-4 py-4 text-sm font-semibold text-slate-950 dark:text-white">Сравнить все тарифы</summary>
      <div className="overflow-x-auto border-t border-slate-100 dark:border-white/10">
        <table className="w-full min-w-[680px] text-sm">
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
              <tr key={plan.id}>
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

function BuyStep({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle: string }) {
  return (
    <div className="flex min-w-0 flex-col items-center justify-center gap-2 rounded-xl px-2 py-2.5 text-center sm:flex-row sm:justify-start sm:px-3 sm:text-left">
      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-slate-100 text-cyan-700 dark:bg-white/10 dark:text-cyan-200">
        {icon}
      </div>
      <span className="min-w-0 leading-tight">
        <span className="block text-xs font-semibold text-slate-900 dark:text-white sm:text-sm">{title}</span>
        <span className="mt-0.5 block text-[11px] text-slate-500 dark:text-slate-400 sm:text-xs">{subtitle}</span>
      </span>
    </div>
  )
}
