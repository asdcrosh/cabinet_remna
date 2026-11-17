// Предложения дополнений к подписке: белые списки и дополнительные устройства.
// Общая логика для главной и раздела «Подписка», чтобы условия показа совпадали.

import {
  getWhitelistAddonRemainingSeconds,
  hasWhitelistAddonEntitlement,
  isWhitelistAddonCurrentlyActive,
} from './whitelist-addon-policy'

type WhitelistAddonPlan = {
  whitelistAddonEnabled: boolean
  whitelistAddonPriceKopecks: number
  whitelistAddonInternalSquads: string[]
}

type DeviceAddonPlan = {
  deviceAddonEnabled: boolean
  unlimitedDevices: boolean
  deviceLimit: number
  maxDeviceLimit: number
  extraDevicePriceKopecks: number
  durationDays: number
}

type WhitelistAddonSubscription = {
  planId: string | null
  status: string
  expireAt: Date
  graceExpireAt?: Date | null
  whitelistAddonActive: boolean
  whitelistAddonExpireAt: Date | null
  whitelistAddonPausedAt: Date | null
  whitelistAddonRemainingSeconds: bigint | null
  plan: WhitelistAddonPlan | null
}

type DeviceAddonSubscription = {
  planId: string | null
  status: string
  deviceLimit: number | null
  plan: DeviceAddonPlan | null
}

export type WhitelistAddonOffer = {
  planId: string
  priceKopecks: number
  active: boolean
  expireAt: string | null
  pausedRemainingSeconds?: number
}

export type DeviceAddonOffer = {
  planId: string
  currentLimit: number
  maxLimit: number
  durationDays: number
  extraDevicePriceKopecks: number
  expireAt: string
}

/**
 * subscriptions — подписки пользователя, новые первыми (orderBy expireAt desc).
 * usable / effectiveExpireAt — итог resolveSubscriptionPresentation.
 */
export function buildWhitelistAddonOffer<S extends WhitelistAddonSubscription>({
  subscriptions,
  usable,
  effectiveExpireAt,
  now = new Date(),
}: {
  subscriptions: S[]
  usable: boolean
  effectiveExpireAt: Date | null | undefined
  now?: Date
}): WhitelistAddonOffer | null {
  const latest = subscriptions[0] ?? null
  const row = subscriptions.find((subscription) => hasWhitelistAddonEntitlement(subscription, now)) ?? latest
  if (!row) return null

  const active = isWhitelistAddonCurrentlyActive(row, now)
  const derivedPausedSeconds = row.whitelistAddonActive && !active
    ? getWhitelistAddonRemainingSeconds(
        row.whitelistAddonExpireAt,
        row.whitelistAddonPausedAt ?? (row.expireAt < now ? row.expireAt : now)
      )
    : 0n
  const pausedSeconds = row.whitelistAddonRemainingSeconds && row.whitelistAddonRemainingSeconds > 0n
    ? row.whitelistAddonRemainingSeconds
    : derivedPausedSeconds
  const configured = Boolean(
    row.plan?.whitelistAddonEnabled
    && row.plan.whitelistAddonPriceKopecks > 0
    && row.plan.whitelistAddonInternalSquads.length > 0
  )
  const paused = pausedSeconds > 0n
  const canBuy = Boolean(usable && effectiveExpireAt && effectiveExpireAt > now)

  if (!row.planId || !row.plan) return null
  if (!paused && !canBuy) return null
  if (!active && !paused && !configured) return null

  return {
    planId: row.planId,
    priceKopecks: row.plan.whitelistAddonPriceKopecks,
    active,
    expireAt: row.whitelistAddonExpireAt?.toISOString() ?? null,
    pausedRemainingSeconds: paused ? Number(pausedSeconds) : undefined,
  }
}

export function buildDeviceAddonOffer({
  subscription,
  usable,
  expireAt,
  now = new Date(),
}: {
  subscription: DeviceAddonSubscription | null
  usable: boolean
  expireAt: Date | null | undefined
  now?: Date
}): DeviceAddonOffer | null {
  const plan = subscription?.plan
  if (!subscription?.planId || !plan) return null
  const currentLimit = subscription.deviceLimit ?? plan.deviceLimit ?? null
  if (
    !plan.deviceAddonEnabled
    || plan.unlimitedDevices
    || !currentLimit
    || currentLimit >= plan.maxDeviceLimit
    || plan.extraDevicePriceKopecks <= 0
    || !usable
    || !['ACTIVE', 'LIMITED'].includes(subscription.status)
    || !expireAt
    || expireAt.getTime() <= now.getTime()
  ) {
    return null
  }

  return {
    planId: subscription.planId,
    currentLimit,
    maxLimit: plan.maxDeviceLimit,
    durationDays: plan.durationDays,
    extraDevicePriceKopecks: plan.extraDevicePriceKopecks,
    expireAt: expireAt.toISOString(),
  }
}
