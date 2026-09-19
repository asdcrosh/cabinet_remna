import { calculatePlanPurchase, type DevicePricedPlan } from './plan-purchase'

export function calculateRenewalPricing(
  plan: Pick<DevicePricedPlan, 'priceKopecks' | 'deviceLimit' | 'maxDeviceLimit' | 'extraDevicePriceKopecks'>,
  deviceLimit: number,
  personalDiscountPercent: number,
  addonPriceKopecks = 0
) {
  const purchase = calculatePlanPurchase(plan, deviceLimit)
  const discountPercent = normalizeDiscountPercent(personalDiscountPercent)
  const rawDiscount = Math.floor((plan.priceKopecks * discountPercent) / 100)
  const discountKopecks = plan.priceKopecks > 100
    ? Math.min(rawDiscount, plan.priceKopecks - 100)
    : 0
  const normalizedAddonPrice = Math.max(0, Math.trunc(addonPriceKopecks))

  return {
    ...purchase,
    discountPercent,
    discountKopecks,
    addonPriceKopecks: normalizedAddonPrice,
    totalOriginalAmountKopecks: purchase.originalAmountKopecks + normalizedAddonPrice,
    totalAmountKopecks: purchase.originalAmountKopecks - discountKopecks + normalizedAddonPrice,
  }
}

export function tryCalculateRenewalPricing(
  plan: Pick<DevicePricedPlan, 'priceKopecks' | 'deviceLimit' | 'maxDeviceLimit' | 'extraDevicePriceKopecks'>,
  deviceLimit: number,
  personalDiscountPercent: number,
  addonPriceKopecks = 0
) {
  try {
    return calculateRenewalPricing(plan, deviceLimit, personalDiscountPercent, addonPriceKopecks)
  } catch {
    return null
  }
}

function normalizeDiscountPercent(value: number) {
  return Number.isInteger(value) && value >= 0 && value <= 99 ? value : 0
}
