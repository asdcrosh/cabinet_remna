// /dashboard/plans — выбор тарифа. Серверный компонент: планы
// подтянем напрямую из Prisma (не из /api/plans, чтобы не ходить самому к себе).

import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { PlanCard } from '@/components/dashboard/plan-card'
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
  searchParams?: { plan?: string; promo?: string; intent?: string }
}) {
  const session = await getCurrentUser()
  const linkedPlanId = searchParams?.plan?.trim()
  const initialPromoCode = searchParams?.promo?.trim()
  const isRenewIntent = searchParams?.intent === 'renew'
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

  return (
    <div className="page-stack">
      <PageHeader
        title="Купить VPN"
        description="Выберите тариф и оплатите онлайн"
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

      <section className="card relative overflow-hidden p-3 sm:p-5">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-cyan-400 via-emerald-400 to-transparent" />
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <div>
            <h2 className="text-lg font-semibold tracking-tight sm:text-2xl">Выберите срок доступа</h2>
            <p className="mt-1 max-w-2xl text-sm text-slate-500 dark:text-slate-400">
              Оплата онлайн, подключение сразу в кабинете.
            </p>
          </div>
          <div className="hidden grid-cols-3 gap-1.5 sm:grid sm:gap-2 lg:w-[34rem]">
            <BuyStep icon={<ShieldCheck className="h-4 w-4" />} title="Тариф" />
            <BuyStep icon={<CreditCard className="h-4 w-4" />} title="Оплата" />
            <BuyStep icon={<KeyRound className="h-4 w-4" />} title="Подключение" />
          </div>
        </div>
      </section>

      {isRenewIntent && (
        <section className="rounded-lg border border-cyan-200 bg-cyan-50/80 px-4 py-3 text-sm text-cyan-950 shadow-sm dark:border-cyan-400/30 dark:bg-cyan-400/10 dark:text-cyan-50">
          <div className="font-semibold">Продление подписки</div>
          <div className="mt-1 text-cyan-900/75 dark:text-cyan-50/75">
            Выберите текущий или любой другой тариф. После оплаты срок доступа обновится автоматически.
          </div>
        </section>
      )}

      {needsTelegramCheckForPromo && (
        <div className="flex flex-col gap-3 rounded-lg border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm text-amber-900 shadow-sm dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100 sm:flex-row sm:items-center sm:justify-between">
          <span>Пробный тариф откроется после проверки Telegram.</span>
          <Link href="/dashboard/settings" className="btn-secondary h-10 shrink-0 px-4 text-sm">
            Проверить Telegram
          </Link>
        </div>
      )}

      <div className="grid auto-rows-fr grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:gap-4">
        {visiblePlans.length === 0 && (
          <div className="card col-span-full py-12 text-center">
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
        {visiblePlans.map((p, index) => (
          <PlanCard
            key={p.id}
            id={p.id}
            name={p.name}
            description={p.description}
            price={formatPrice(p.priceKopecks)}
            priceKopecks={p.priceKopecks}
            durationDays={p.durationDays}
            trafficLimitGb={p.trafficLimitGb}
            deviceLimit={p.deviceLimit}
            isPromo={p.isPromo}
            popular={index === 1}
            current={currentSubscription?.planId === p.id}
            initialPromoCode={initialPromoCode}
            availablePromoCodes={availablePromoCodesByPlan.get(p.id) ?? []}
          />
        ))}
      </div>
    </div>
  )
}

function BuyStep({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="flex min-w-0 flex-col items-center justify-center gap-1 rounded-lg border border-slate-100 bg-slate-50/80 p-2 text-center text-xs font-medium dark:border-slate-800 dark:bg-surface-800/70 sm:flex-row sm:justify-start sm:gap-2 sm:p-2.5 sm:text-sm sm:text-left">
      <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-slate-950 text-cyan-200 dark:bg-white dark:text-slate-950">
        {icon}
      </div>
      <span className="truncate">{title}</span>
    </div>
  )
}
