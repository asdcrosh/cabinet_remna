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
import { calculateAutoRenewalPurchase, getAutoRenewalState } from '@/lib/auto-renewal'
import { AUTO_RENEWAL_CONSENT_VERSION } from '@/lib/auto-renewal-consent'
import {
  hasRemnawaveUserReference,
  remnawave,
  remnawaveUserReference,
} from '@/lib/remnawave'

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
          remnawaveId: true,
          remnawaveUuid: true,
          remnawaveUsername: true,
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
  const autoRenewal = session ? await getAutoRenewalState(session.uid) : null
  let currentDeviceLimit = currentSubscription?.deviceLimit ?? null
  if (currentDeviceLimit == null && user && hasRemnawaveUserReference(user)) {
    try {
      const remote = await remnawave.getUser(remnawaveUserReference(user))
      currentDeviceLimit = remote.response.hwidDeviceLimit ?? null
    } catch {
      // Витрина остаётся доступной; сервер всё равно проверит выбранное значение перед оплатой.
    }
  }
  const hasAnySubscription = session
    ? (await prisma.subscription.count({ where: { userId: session.uid } })) > 0
    : false
  const canUsePromo =
    Boolean(user?.telegramId) &&
    Boolean(user?.remnashopSyncedAt) &&
    !usedTrialPlanIds.size &&
    !hasAnySubscription &&
    !user?.remnashopUserId &&
    !user?.remnawaveId &&
    !user?.remnawaveUuid &&
    !user?.remnawaveUsername
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
    !user?.remnawaveId &&
    !user?.remnawaveUuid &&
    !user?.remnawaveUsername
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
  const autoRenewalAvailable = paymentProviders.some((provider) => provider.id === 'YOOKASSA')
  const autoRenewalCurrentPrice = autoRenewal
    ? currentAutoRenewalPrice(
        autoRenewal.plan,
        autoRenewal.deviceLimit,
        autoRenewal.whitelistAddonEnabled
      )
    : null
  const autoRenewalConsentCurrent = Boolean(
    autoRenewal
    && autoRenewal.status !== 'DISABLED'
    && autoRenewal.consentAcceptedAt
    && autoRenewal.consentVersion === AUTO_RENEWAL_CONSENT_VERSION
    && autoRenewal.deviceLimit === (currentDeviceLimit ?? autoRenewal.plan.deviceLimit)
    && autoRenewal.consentPriceKopecks === autoRenewalCurrentPrice
    && autoRenewal.consentDurationDays === autoRenewal.plan.durationDays
  )
  const activeAutoRenewal = Boolean(
    autoRenewalConsentCurrent
    && autoRenewal?.status === 'ACTIVE'
    && autoRenewal.paymentMethodSavedAt
  )
  const currentPlanName = plans.find((plan) => plan.id === currentSubscription?.planId)?.name ?? null
  const currentWhitelistAddonActive = Boolean(
    currentSubscription?.whitelistAddonActive
    && currentSubscription.whitelistAddonExpireAt
    && currentSubscription.whitelistAddonExpireAt.getTime() > Date.now()
  )
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
    maxDeviceLimit: plan.maxDeviceLimit,
    extraDevicePriceKopecks: plan.extraDevicePriceKopecks,
    initialDeviceLimit: plan.isPromo
      ? plan.deviceLimit
      : clampDeviceLimit(currentDeviceLimit ?? plan.deviceLimit, plan.deviceLimit, plan.maxDeviceLimit),
    currentDeviceLimit,
    isPromo: plan.isPromo,
    promoCodesEnabled: plan.promoCodesEnabled,
    popular: plan.isFeatured,
    current: currentSubscription?.planId === plan.id,
    isPlanSwitch: Boolean(currentSubscription && currentSubscription.planId !== plan.id),
    currentPlanName,
    currentWhitelistAddonActive,
    currentWhitelistAddonExpireAt: currentWhitelistAddonActive
      ? currentSubscription?.whitelistAddonExpireAt?.toISOString() ?? null
      : null,
    autoRenewalEnabled: autoRenewalConsentCurrent && autoRenewal?.plan.id === plan.id,
    autoRenewalWhitelistAddonEnabled: autoRenewal?.plan.id === plan.id
      && autoRenewal.whitelistAddonEnabled,
    whitelistAddonEnabled: plan.whitelistAddonEnabled,
    whitelistAddonPriceKopecks: plan.whitelistAddonPriceKopecks,
    initialPromoCode,
    availablePromoCodes: availablePromoCodesByPlan.get(plan.id) ?? [],
    paymentProviders,
  }))

  return (
    <div className="user-workspace page-stack">
      <PageHeader
        title="Тарифы"
        description="Один доступ, разные сроки. Чем дольше период, тем ниже цена дня."
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
        <section className="relative flex items-start gap-3 overflow-hidden rounded-[1.25rem] border border-cyan-200/80 bg-gradient-to-br from-cyan-50 via-white to-sky-50/70 p-4 text-sm text-slate-700 shadow-[0_12px_32px_-25px_rgba(8,145,178,0.55)] dark:border-cyan-400/15 dark:from-cyan-500/[0.09] dark:via-white/[0.025] dark:to-sky-500/[0.05] dark:text-slate-200">
          <div className="pointer-events-none absolute -right-10 -top-14 h-28 w-28 rounded-full bg-cyan-300/20 blur-2xl dark:bg-cyan-300/10" />
          <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-700 ring-1 ring-cyan-500/15 dark:text-cyan-200">
            <RefreshCw className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <div className="font-semibold">Продление подписки</div>
            <div className="mt-1 leading-5 text-slate-500 dark:text-slate-400">
              Можно выбрать текущий или другой тариф. Оплаченный срок добавится автоматически.
            </div>
          </div>
        </section>
      )}

      {needsTelegramCheckForPromo && (
        <div className="relative flex items-center gap-3 overflow-hidden rounded-[1.25rem] border border-amber-200/80 bg-gradient-to-br from-amber-50 via-white to-orange-50/70 p-4 text-sm text-slate-800 shadow-[0_12px_32px_-25px_rgba(217,119,6,0.5)] dark:border-amber-400/15 dark:from-amber-500/[0.09] dark:via-white/[0.025] dark:to-orange-500/[0.05] dark:text-slate-100">
          <span className="flex min-w-0 items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-700 ring-1 ring-amber-500/15 dark:text-amber-200">
              <MessageCircleQuestion className="h-4 w-4" />
            </span>
            <span className="min-w-0">
              <span className="block font-semibold">Доступен пробный тариф</span>
              <span className="mt-0.5 block truncate text-xs text-slate-500 dark:text-slate-400">Подтвердите аккаунт через Telegram</span>
            </span>
          </span>
          <Link href="/dashboard/settings" aria-label="Перейти к проверке аккаунта" className="ml-auto inline-flex min-h-9 shrink-0 items-center justify-center gap-1.5 px-1 font-semibold text-slate-800 underline decoration-slate-300 underline-offset-4 hover:decoration-cyan-500 dark:text-slate-100 dark:decoration-white/20 sm:px-3">
            <span className="hidden sm:inline">Проверить</span>
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      )}

      {autoRenewalAvailable ? (
        <section className="relative flex flex-col gap-3 overflow-hidden rounded-[1.25rem] border border-slate-200/80 bg-white p-4 shadow-[0_14px_36px_-28px_rgba(15,23,42,0.45)] dark:border-white/[0.09] dark:bg-white/[0.035] sm:flex-row sm:items-center sm:justify-between" aria-label="Автопродление">
          <div className="pointer-events-none absolute inset-y-0 left-0 w-28 bg-gradient-to-r from-violet-500/[0.07] to-transparent dark:from-violet-400/[0.08]" />
          <div className="flex min-w-0 items-start gap-3">
            <span className="relative grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-violet-500/10 text-violet-600 ring-1 ring-violet-500/15 dark:text-violet-300">
              <RefreshCw className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-sm font-semibold text-slate-950 dark:text-white">Автопродление</h2>
                <span className={activeAutoRenewal ? 'rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300' : 'rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500 dark:bg-white/[0.06] dark:text-slate-400'}>
                  {activeAutoRenewal ? 'Включено' : autoRenewalConsentCurrent ? 'Ожидает оплаты' : 'По желанию'}
                </span>
              </div>
              <p className="mt-0.5 text-xs leading-5 text-slate-500 dark:text-slate-400">
                {activeAutoRenewal
                  ? `Тариф «${autoRenewal?.plan.name}» продлится автоматически. Управление доступно в разделе платежей.`
                  : autoRenewalConsentCurrent
                    ? 'Завершите оплату картой через ЮKassa, чтобы сохранить способ оплаты.'
                    : 'Вы сможете включить его в окне подтверждения после выбора тарифа.'}
              </p>
            </div>
          </div>
          {autoRenewalConsentCurrent ? (
            <Link href="/dashboard/billing" className="inline-flex min-h-9 shrink-0 items-center gap-1.5 self-start text-sm font-semibold text-slate-700 hover:text-slate-950 dark:text-slate-300 dark:hover:text-white sm:self-auto">
              Управлять <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          ) : null}
        </section>
      ) : null}

      {planViews.length > 0 ? (
        <PlanCatalog
          key={`${currentSubscription?.planId ?? 'none'}:${currentDeviceLimit ?? 'unknown'}:${linkedPlanId ?? ''}`}
          plans={planViews}
          initialPlanId={linkedPlanId}
        />
      ) : null}

      {planViews.length === 0 && (
        <div className="rounded-[1.5rem] border border-dashed border-slate-300 bg-white px-4 py-10 text-center shadow-sm dark:border-white/15 dark:bg-white/[0.025] sm:px-6 sm:py-12">
          <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-500/10 text-cyan-700 ring-1 ring-cyan-500/15 dark:text-cyan-200">
            <ShieldCheck className="h-6 w-6" />
          </span>
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

function currentAutoRenewalPrice(
  plan: {
    priceKopecks: number
    deviceLimit: number
    maxDeviceLimit: number
    extraDevicePriceKopecks: number
    whitelistAddonEnabled: boolean
    whitelistAddonPriceKopecks: number
    whitelistAddonInternalSquads: string[]
  },
  deviceLimit: number,
  includeWhitelistAddon: boolean
) {
  try {
    if (
      includeWhitelistAddon
      && (!plan.whitelistAddonEnabled
        || plan.whitelistAddonPriceKopecks <= 0
        || plan.whitelistAddonInternalSquads.length === 0)
    ) return null
    return calculateAutoRenewalPurchase(plan, deviceLimit).originalAmountKopecks
      + (includeWhitelistAddon ? plan.whitelistAddonPriceKopecks : 0)
  } catch {
    return null
  }
}

function clampDeviceLimit(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(minimum, maximum), Math.max(minimum, value))
}
