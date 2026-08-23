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
        <section className="flex items-start gap-3 border-l-2 border-cyan-500 py-1 pl-3 text-sm text-slate-700 dark:text-slate-200">
          <RefreshCw className="mt-0.5 h-4 w-4 shrink-0 text-cyan-700 dark:text-cyan-300" />
          <div className="min-w-0">
            <div className="font-semibold">Продление подписки</div>
            <div className="mt-1 leading-5 text-slate-500 dark:text-slate-400">
              Можно выбрать текущий или другой тариф. Оплаченный срок добавится автоматически.
            </div>
          </div>
        </section>
      )}

      {needsTelegramCheckForPromo && (
        <div className="flex items-center gap-3 border-l-2 border-amber-400 py-1 pl-3 text-sm text-slate-800 dark:text-slate-100">
          <span className="flex min-w-0 items-center gap-3">
            <MessageCircleQuestion className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-300" />
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
        <section className="flex flex-col gap-3 border-y border-slate-200 py-3 dark:border-white/[0.08] sm:flex-row sm:items-center sm:justify-between" aria-label="Автопродление">
          <div className="flex min-w-0 items-start gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand-500/10 text-brand-600 dark:text-brand-300">
              <RefreshCw className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-sm font-semibold text-slate-950 dark:text-white">Автопродление</h2>
                <span className={activeAutoRenewal ? 'text-xs font-semibold text-emerald-600 dark:text-emerald-300' : 'text-xs font-medium text-slate-400'}>
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
        <div className="border-y border-slate-200 px-4 py-10 text-center dark:border-white/[0.08] sm:px-6 sm:py-12">
          <ShieldCheck className="mx-auto mb-4 h-7 w-7 text-cyan-700 dark:text-cyan-200" />
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
