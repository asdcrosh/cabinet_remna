// Витрина тарифов для конкретного пользователя: какие тарифы ему доступны, с какими
// скидками, лимитом устройств, дополнением БС и автопродлением.
// Общая для страницы /dashboard/plans и мобильного API (/api/mobile/checkout).

import { prisma } from '@/lib/prisma'
import { formatPrice } from '@/lib/format'
import { getPlanAudienceContext, isPlanAvailableForUser } from '@/lib/plan-access'
import { getAvailableUserPromoCodesByPlan } from '@/lib/user-promo-codes'
import { getAvailablePaymentProviders } from '@/lib/payment-providers'
import { getAutoRenewalState } from '@/lib/auto-renewal'
import { AUTO_RENEWAL_CONSENT_VERSION } from '@/lib/auto-renewal-consent'
import { tryCalculateRenewalPricing } from '@/lib/renewal-pricing'
import {
  hasRemnawaveUserReference,
  remnawave,
  remnawaveUserReference,
} from '@/lib/remnawave'
import { hasWhitelistAddonEntitlement, isWhitelistAddonCurrentlyActive } from '@/lib/whitelist-addon-policy'
import { isTrialDeviceUsed } from '@/lib/mobile-trial'

export interface PlanCatalogOptions {
  userId: string | null
  /** Тариф по прямой ссылке (?plan=…): показываем, даже если он доступен только по ссылке. */
  linkedPlanId?: string
  initialPromoCode?: string
  whitelistAddonRequested?: boolean
  /**
   * Витрина приложения StealthNet: пробный тариф без Telegram, один на телефон.
   * trialDeviceKey — ключ телефона; без него пробный не показывается.
   */
  mobileApp?: { trialDeviceKey: string | null }
}

export type PlanCatalog = Awaited<ReturnType<typeof buildPlanCatalog>>
export type PlanCatalogItem = PlanCatalog['plans'][number]

export async function buildPlanCatalog(options: PlanCatalogOptions) {
  const { userId, linkedPlanId, initialPromoCode, mobileApp } = options
  const paymentProviders = await getAvailablePaymentProviders()
  const plans = await prisma.plan.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: 'asc' },
  })
  const user = userId
    ? await prisma.user.findUnique({
        where: { id: userId },
        select: {
          role: true,
          personalDiscountPercent: true,
          nextPurchaseDiscountPercent: true,
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
  const audienceContext = userId ? await getPlanAudienceContext(userId) : null
  const usedTrialPlanIds = userId
    ? new Set(
        (
          await prisma.trialPlanRedemption.findMany({
            where: {
              userId,
              payment: { subscriptionProvisionedAt: { not: null } },
            },
            select: { planId: true },
          })
        ).map((redemption) => redemption.planId)
      )
    : new Set<string>()
  const currentSubscription = userId
    ? await prisma.subscription.findFirst({
        where: { userId, status: { in: ['ACTIVE', 'LIMITED'] }, expireAt: { gt: new Date() } },
        orderBy: { expireAt: 'desc' },
        include: { plan: { select: { name: true, unlimitedDuration: true, unlimitedDevices: true, deviceLimit: true } } },
      })
    : null
  const whitelistAddonEntitlement = userId
    ? await prisma.subscription.findFirst({
        where: {
          userId,
          OR: [
            { whitelistAddonActive: true },
            { whitelistAddonRemainingSeconds: { gt: 0n } },
          ],
        },
        orderBy: { updatedAt: 'desc' },
      })
    : null
  const autoRenewal = userId ? await getAutoRenewalState(userId) : null
  let currentDeviceLimit = currentSubscription?.deviceLimit ?? null
  if (currentDeviceLimit == null && user && hasRemnawaveUserReference(user)) {
    try {
      const remote = await remnawave.getUser(remnawaveUserReference(user))
      currentDeviceLimit = remote.response.hwidDeviceLimit ?? null
    } catch {
      // Витрина остаётся доступной; сервер всё равно проверит выбранное значение перед оплатой.
    }
  }
  const hasAnySubscription = userId
    ? (await prisma.subscription.count({ where: { userId } })) > 0
    : false
  const mobileTrialDeviceFree = mobileApp?.trialDeviceKey
    ? !(await isTrialDeviceUsed(mobileApp.trialDeviceKey))
    : false
  const telegramChecked = Boolean(user?.remnashopSyncedAt)
  const trialIdentityEligible = mobileApp
    ? mobileTrialDeviceFree && (!user?.telegramId || telegramChecked)
    : Boolean(user?.telegramId) && telegramChecked
  const canUsePromo =
    trialIdentityEligible &&
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
  const availablePromoCodesByPlan = userId
    ? await getAvailableUserPromoCodesByPlan({ userId, plans: visiblePlans, linkPromoCode: initialPromoCode })
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
    !mobileApp &&
    hasPromoPlan &&
    isOtherwiseEligibleForPromo &&
    (!user?.telegramId || !user?.remnashopSyncedAt)
  const referencePlan = visiblePlans
    .filter((plan) => !plan.isPromo && !plan.unlimitedDuration && plan.priceKopecks > 0)
    .sort((a, b) => a.durationDays - b.durationDays)[0]
  const referenceDailyPrice = referencePlan
    ? referencePlan.priceKopecks / Math.max(1, referencePlan.durationDays)
    : 0
  const autoRenewalAvailable = paymentProviders.some((provider) => provider.id === 'YOOKASSA')
  const autoRenewalCurrentPrice = autoRenewal
    ? currentAutoRenewalPrice(
        autoRenewal.plan,
        autoRenewal.deviceLimit,
        autoRenewal.whitelistAddonEnabled,
        user?.personalDiscountPercent ?? 0
      )
    : null
  const autoRenewalConsentCurrent = Boolean(
    autoRenewal
    && autoRenewal.status !== 'DISABLED'
    && autoRenewal.consentAcceptedAt
    && autoRenewal.consentVersion === AUTO_RENEWAL_CONSENT_VERSION
    && autoRenewal.deviceLimit === (currentDeviceLimit ?? autoRenewal.plan.deviceLimit)
    && autoRenewal.consentPriceKopecks != null
    && autoRenewalCurrentPrice != null
    && autoRenewal.consentPriceKopecks >= autoRenewalCurrentPrice
    && autoRenewal.consentDurationDays === autoRenewal.plan.durationDays
  )
  const activeAutoRenewal = Boolean(
    autoRenewalConsentCurrent
    && autoRenewal?.status === 'ACTIVE'
    && autoRenewal.paymentMethodSavedAt
  )
  const currentPlanName = currentSubscription?.plan?.name ?? null
  const currentWhitelistAddonActive = Boolean(
    whitelistAddonEntitlement
    && hasWhitelistAddonEntitlement(whitelistAddonEntitlement)
  )
  const currentWhitelistAddonRunning = Boolean(
    whitelistAddonEntitlement
    && isWhitelistAddonCurrentlyActive(whitelistAddonEntitlement)
  )
  const planViews = visiblePlans.map((plan) => ({
    id: plan.id,
    name: plan.name,
    description: plan.description,
    price: formatPrice(plan.priceKopecks),
    priceKopecks: plan.priceKopecks,
    monthlyPrice: formatPrice(Math.round((plan.priceKopecks / Math.max(1, plan.durationDays)) * 30)),
    savingsPercent: !plan.isPromo && !plan.unlimitedDuration && referenceDailyPrice > 0
      ? Math.max(0, Math.round((1 - (plan.priceKopecks / Math.max(1, plan.durationDays)) / referenceDailyPrice) * 100))
      : 0,
    durationDays: plan.durationDays,
    unlimitedDuration: plan.unlimitedDuration,
    trafficLimitGb: plan.trafficLimitGb,
    deviceLimit: plan.deviceLimit,
    unlimitedDevices: plan.unlimitedDevices,
    maxDeviceLimit: plan.maxDeviceLimit,
    deviceAddonEnabled: plan.deviceAddonEnabled,
    extraDevicePriceKopecks: plan.extraDevicePriceKopecks,
    initialDeviceLimit: plan.isPromo || plan.unlimitedDevices
      ? plan.deviceLimit
      : plan.deviceAddonEnabled
        ? clampDeviceLimit(currentDeviceLimit ?? plan.deviceLimit, plan.deviceLimit, plan.maxDeviceLimit)
        : currentSubscription?.planId === plan.id
          ? Math.max(plan.deviceLimit, currentDeviceLimit ?? plan.deviceLimit)
          : plan.deviceLimit,
    currentDeviceLimit,
    isPromo: plan.isPromo,
    promoCodesEnabled: plan.promoCodesEnabled,
    popular: plan.isFeatured,
    current: currentSubscription?.planId === plan.id,
    isPlanSwitch: Boolean(currentSubscription && currentSubscription.planId !== plan.id),
    currentPlanName,
    currentWhitelistAddonActive,
    currentWhitelistAddonExpireAt: currentWhitelistAddonActive
      ? currentWhitelistAddonRunning
        ? whitelistAddonEntitlement?.whitelistAddonExpireAt?.toISOString() ?? null
        : null
      : null,
    autoRenewalEnabled: autoRenewalConsentCurrent && autoRenewal?.plan.id === plan.id,
    autoRenewalWhitelistAddonEnabled: autoRenewal?.plan.id === plan.id
      && autoRenewal.whitelistAddonEnabled,
    whitelistAddonEnabled: plan.whitelistAddonEnabled,
    whitelistAddonPriceKopecks: plan.whitelistAddonPriceKopecks,
    initialWhitelistAddonRequested: Boolean(options.whitelistAddonRequested)
      && plan.whitelistAddonEnabled
      && plan.whitelistAddonPriceKopecks > 0
      && plan.whitelistAddonInternalSquads.length > 0,
    initialPromoCode,
    availablePromoCodes: availablePromoCodesByPlan.get(plan.id) ?? [],
    personalDiscountPercent: user?.personalDiscountPercent ?? 0,
    nextPurchaseDiscountPercent: user?.nextPurchaseDiscountPercent ?? 0,
    paymentProviders,
  }))

  return {
    plans: planViews,
    paymentProviders,
    canManagePlans,
    currentSubscription,
    currentDeviceLimit,
    needsTelegramCheckForPromo,
    autoRenewal,
    autoRenewalAvailable,
    autoRenewalConsentCurrent,
    activeAutoRenewal,
  }
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
  includeWhitelistAddon: boolean,
  personalDiscountPercent: number
) {
  try {
    if (
      includeWhitelistAddon
      && (!plan.whitelistAddonEnabled
        || plan.whitelistAddonPriceKopecks <= 0
        || plan.whitelistAddonInternalSquads.length === 0)
    ) return null
    return tryCalculateRenewalPricing(
      plan,
      deviceLimit,
      personalDiscountPercent,
      includeWhitelistAddon ? plan.whitelistAddonPriceKopecks : 0
    )?.totalAmountKopecks ?? null
  } catch {
    return null
  }
}

function clampDeviceLimit(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(minimum, maximum), Math.max(minimum, value))
}
