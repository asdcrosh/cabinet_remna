export interface DevicePricedPlan {
  id: string
  name: string
  priceKopecks: number
  durationDays: number
  unlimitedDuration?: boolean
  trafficLimitGb: number | null
  deviceLimit: number
  unlimitedDevices?: boolean
  maxDeviceLimit: number
  extraDevicePriceKopecks: number
  activeInternalSquads: string[]
  remnashopPlanId?: number | null
}

export interface PlanPurchasePricing {
  baseDeviceLimit: number
  maxDeviceLimit: number
  selectedDeviceLimit: number
  extraDeviceCount: number
  extraDeviceAmountKopecks: number
  originalAmountKopecks: number
}

export interface PlanPurchaseSnapshot {
  version: 1
  id: string
  remnashopPlanId: number | null
  name: string
  durationDays: number
  unlimitedDuration: boolean
  trafficLimitGb: number | null
  unlimitedDevices: boolean
  baseDeviceLimit: number
  maxDeviceLimit: number
  selectedDeviceLimit: number
  extraDevicePriceKopecks: number
  extraDeviceCount: number
  extraDeviceAmountKopecks: number
  basePriceKopecks: number
  originalAmountKopecks: number
  activeInternalSquads: string[]
  deviceLimitSelectionConfirmed: boolean
  switchFromPlan: { id: string; name: string } | null
}

export class DeviceLimitSelectionError extends Error {
  constructor(
    message: string,
    public code = 'DEVICE_LIMIT_INVALID'
  ) {
    super(message)
    this.name = 'DeviceLimitSelectionError'
  }
}

export function calculatePlanPurchase(
  plan: Pick<DevicePricedPlan, 'priceKopecks' | 'deviceLimit' | 'maxDeviceLimit' | 'extraDevicePriceKopecks'>,
  requestedDeviceLimit?: number | null
): PlanPurchasePricing {
  const baseDeviceLimit = plan.deviceLimit
  const maxDeviceLimit = Math.max(baseDeviceLimit, plan.maxDeviceLimit)
  const selectedDeviceLimit = requestedDeviceLimit ?? baseDeviceLimit

  if (!Number.isInteger(selectedDeviceLimit)) {
    throw new DeviceLimitSelectionError('Количество устройств должно быть целым числом')
  }
  if (selectedDeviceLimit < baseDeviceLimit || selectedDeviceLimit > maxDeviceLimit) {
    throw new DeviceLimitSelectionError(
      `Выберите от ${baseDeviceLimit} до ${maxDeviceLimit} устройств`,
      'DEVICE_LIMIT_OUT_OF_RANGE'
    )
  }

  const extraDeviceCount = selectedDeviceLimit - baseDeviceLimit
  const extraDeviceAmountKopecks = extraDeviceCount * plan.extraDevicePriceKopecks

  return {
    baseDeviceLimit,
    maxDeviceLimit,
    selectedDeviceLimit,
    extraDeviceCount,
    extraDeviceAmountKopecks,
    originalAmountKopecks: plan.priceKopecks + extraDeviceAmountKopecks,
  }
}

export function buildPlanPurchaseSnapshot(
  plan: DevicePricedPlan,
  pricing: PlanPurchasePricing,
  currentPlan?: { id: string; name: string } | null
): PlanPurchaseSnapshot {
  return {
    version: 1,
    id: plan.id,
    remnashopPlanId: plan.remnashopPlanId ?? null,
    name: plan.name,
    durationDays: plan.durationDays,
    unlimitedDuration: plan.unlimitedDuration === true,
    trafficLimitGb: plan.trafficLimitGb,
    unlimitedDevices: plan.unlimitedDevices === true,
    baseDeviceLimit: pricing.baseDeviceLimit,
    maxDeviceLimit: pricing.maxDeviceLimit,
    selectedDeviceLimit: pricing.selectedDeviceLimit,
    extraDevicePriceKopecks: plan.extraDevicePriceKopecks,
    extraDeviceCount: pricing.extraDeviceCount,
    extraDeviceAmountKopecks: pricing.extraDeviceAmountKopecks,
    basePriceKopecks: plan.priceKopecks,
    originalAmountKopecks: pricing.originalAmountKopecks,
    activeInternalSquads: plan.activeInternalSquads,
    deviceLimitSelectionConfirmed: plan.unlimitedDevices !== true,
    switchFromPlan: currentPlan && currentPlan.id !== plan.id
      ? { id: currentPlan.id, name: currentPlan.name }
      : null,
  }
}

export function readPlanPurchaseSnapshot(snapshot: unknown): PlanPurchaseSnapshot | null {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return null
  const value = snapshot as Record<string, unknown>
  if (
    value.version !== 1
    || typeof value.id !== 'string'
    || typeof value.name !== 'string'
    || !isPositiveInteger(value.durationDays)
    || !isPositiveInteger(value.baseDeviceLimit)
    || !isPositiveInteger(value.maxDeviceLimit)
    || !isPositiveInteger(value.selectedDeviceLimit)
    || !isNonNegativeInteger(value.extraDevicePriceKopecks)
    || !isNonNegativeInteger(value.extraDeviceCount)
    || !isNonNegativeInteger(value.extraDeviceAmountKopecks)
    || !isNonNegativeInteger(value.basePriceKopecks)
    || !isNonNegativeInteger(value.originalAmountKopecks)
    || !Array.isArray(value.activeInternalSquads)
    || !value.activeInternalSquads.every((item) => typeof item === 'string')
  ) {
    return null
  }

  const trafficLimitGb = value.trafficLimitGb
  if (trafficLimitGb !== null && !isPositiveInteger(trafficLimitGb)) return null
  const remnashopPlanId = value.remnashopPlanId
  if (remnashopPlanId !== null && remnashopPlanId !== undefined && !isPositiveInteger(remnashopPlanId)) return null
  const switchFromPlan = value.switchFromPlan
  if (
    switchFromPlan !== null
    && switchFromPlan !== undefined
    && (
      typeof switchFromPlan !== 'object'
      || Array.isArray(switchFromPlan)
      || typeof Reflect.get(switchFromPlan, 'id') !== 'string'
      || typeof Reflect.get(switchFromPlan, 'name') !== 'string'
    )
  ) return null

  return {
    version: 1,
    id: value.id,
    remnashopPlanId: typeof remnashopPlanId === 'number' ? remnashopPlanId : null,
    name: value.name,
    durationDays: value.durationDays,
    unlimitedDuration: value.unlimitedDuration === true,
    trafficLimitGb,
    unlimitedDevices: value.unlimitedDevices === true,
    baseDeviceLimit: value.baseDeviceLimit,
    maxDeviceLimit: value.maxDeviceLimit,
    selectedDeviceLimit: value.selectedDeviceLimit,
    extraDevicePriceKopecks: value.extraDevicePriceKopecks,
    extraDeviceCount: value.extraDeviceCount,
    extraDeviceAmountKopecks: value.extraDeviceAmountKopecks,
    basePriceKopecks: value.basePriceKopecks,
    originalAmountKopecks: value.originalAmountKopecks,
    activeInternalSquads: value.activeInternalSquads as string[],
    deviceLimitSelectionConfirmed: value.deviceLimitSelectionConfirmed === true,
    switchFromPlan: switchFromPlan && typeof switchFromPlan === 'object'
      ? {
          id: Reflect.get(switchFromPlan, 'id') as string,
          name: Reflect.get(switchFromPlan, 'name') as string,
        }
      : null,
  }
}

export function selectedDeviceLimitFromSnapshot(snapshot: unknown) {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return null
  const selected = Reflect.get(snapshot, 'selectedDeviceLimit')
  if (typeof selected === 'number' && Number.isInteger(selected) && selected > 0) return selected
  const legacy = Reflect.get(snapshot, 'device_limit')
  return typeof legacy === 'number' && Number.isInteger(legacy) && legacy > 0 ? legacy : null
}

export function resolveEffectiveDeviceLimit(input: {
  snapshot: unknown
  paymentDeviceLimit?: number | null
  subscriptionDeviceLimit?: number | null
  planDeviceLimit: number
}) {
  const purchase = readPlanPurchaseSnapshot(input.snapshot)
  if (purchase?.deviceLimitSelectionConfirmed) {
    return input.paymentDeviceLimit ?? purchase.selectedDeviceLimit
  }
  return input.subscriptionDeviceLimit
    ?? input.paymentDeviceLimit
    ?? purchase?.selectedDeviceLimit
    ?? selectedDeviceLimitFromSnapshot(input.snapshot)
    ?? input.planDeviceLimit
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
}
