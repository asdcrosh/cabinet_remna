// GET /api/mobile/checkout — витрина покупки для приложения StealthNet: те же тарифы,
// скидки, способы оплаты и автопродление, что видит пользователь на /dashboard/plans.
// Точную сумму к оплате считает POST /api/mobile/checkout/quote.
import { jsonResponse } from '@/lib/json-response'
import { requireAuth, withAuth } from '@/lib/auth/guard'
import { prisma } from '@/lib/prisma'
import { buildPlanCatalog } from '@/lib/plan-catalog'
import { AUTO_RENEWAL_CONSENT_VERSION } from '@/lib/auto-renewal-consent'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = withAuth(async () => {
  const session = await requireAuth()
  const catalog = await buildPlanCatalog({ userId: session.uid })
  const current = catalog.currentSubscription
  const currentPlan = current?.planId
    ? await prisma.plan.findUnique({
        where: { id: current.planId },
        select: {
          whitelistAddonEnabled: true,
          whitelistAddonPriceKopecks: true,
          whitelistAddonInternalSquads: true,
        },
      })
    : null
  const anyPlan = catalog.plans[0]
  const whitelistAddonActive = anyPlan?.currentWhitelistAddonActive ?? false
  const autoRenewal = catalog.autoRenewal

  return jsonResponse({
    plans: catalog.plans.map((plan) => ({
      id: plan.id,
      name: plan.name,
      description: plan.description,
      priceKopecks: plan.priceKopecks,
      savingsPercent: plan.savingsPercent,
      durationDays: plan.durationDays,
      unlimitedDuration: plan.unlimitedDuration,
      trafficLimitGb: plan.trafficLimitGb,
      deviceLimit: plan.deviceLimit,
      unlimitedDevices: plan.unlimitedDevices,
      maxDeviceLimit: plan.maxDeviceLimit,
      deviceAddonEnabled: plan.deviceAddonEnabled,
      extraDevicePriceKopecks: plan.extraDevicePriceKopecks,
      initialDeviceLimit: plan.initialDeviceLimit,
      isPromo: plan.isPromo,
      promoCodesEnabled: plan.promoCodesEnabled,
      popular: plan.popular,
      current: plan.current,
      isPlanSwitch: plan.isPlanSwitch,
      whitelistAddonAvailable: !plan.isPromo
        && plan.whitelistAddonEnabled
        && plan.whitelistAddonPriceKopecks > 0
        && !plan.currentWhitelistAddonActive,
      whitelistAddonPriceKopecks: plan.whitelistAddonPriceKopecks,
      autoRenewalEnabled: plan.autoRenewalEnabled,
      availablePromoCodes: plan.availablePromoCodes.map((promo: { code: string; discountPercent: number; source: string }) => ({
        code: promo.code,
        discountPercent: promo.discountPercent,
        source: promo.source,
      })),
    })),
    paymentProviders: catalog.paymentProviders,
    personalDiscountPercent: anyPlan?.personalDiscountPercent ?? 0,
    nextPurchaseDiscountPercent: anyPlan?.nextPurchaseDiscountPercent ?? 0,
    needsTelegramCheckForPromo: catalog.needsTelegramCheckForPromo,
    currentSubscription: current
      ? {
          planId: current.planId,
          planName: current.plan?.name ?? null,
          expireAt: current.expireAt.toISOString(),
          unlimitedDuration: current.plan?.unlimitedDuration ?? false,
          unlimitedDevices: current.plan?.unlimitedDevices ?? false,
          deviceLimit: catalog.currentDeviceLimit ?? current.plan?.deviceLimit ?? null,
        }
      : null,
    // Отдельная покупка белых списков к действующей подписке (purchaseType WHITELIST_ADDON).
    whitelistAddon: {
      active: whitelistAddonActive,
      expireAt: anyPlan?.currentWhitelistAddonExpireAt ?? null,
      purchasable: Boolean(
        current
        && !whitelistAddonActive
        && currentPlan?.whitelistAddonEnabled
        && currentPlan.whitelistAddonPriceKopecks > 0
        && currentPlan.whitelistAddonInternalSquads.length > 0
      ),
      priceKopecks: currentPlan?.whitelistAddonPriceKopecks ?? 0,
    },
    autoRenewal: {
      available: catalog.autoRenewalAvailable,
      consentVersion: AUTO_RENEWAL_CONSENT_VERSION,
      consentCurrent: catalog.autoRenewalConsentCurrent,
      active: catalog.activeAutoRenewal,
      status: autoRenewal?.status ?? null,
      planId: autoRenewal?.plan.id ?? null,
      planName: autoRenewal?.plan.name ?? null,
      paymentMethodTitle: autoRenewal?.paymentMethodTitle ?? null,
      nextChargeAt: autoRenewal?.nextChargeAt?.toISOString() ?? null,
      lastError: autoRenewal?.lastError ?? null,
    },
  })
})
