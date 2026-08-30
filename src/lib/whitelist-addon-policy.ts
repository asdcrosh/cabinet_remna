export const WHITELIST_ADDON_DURATION_DAYS = 30
const DAY_MS = 24 * 60 * 60 * 1000
const SECOND_MS = 1000

export function getWhitelistAddonExpireAt(activatedAt: Date) {
  return new Date(activatedAt.getTime() + WHITELIST_ADDON_DURATION_DAYS * DAY_MS)
}

export function isWhitelistAddonCurrentlyActive(input: {
  whitelistAddonActive: boolean
  whitelistAddonExpireAt?: Date | null
  whitelistAddonRemainingSeconds?: bigint | null
  status?: string
  expireAt?: Date
  graceExpireAt?: Date | null
}, now = new Date()) {
  const effectiveSubscriptionExpireAt = input.graceExpireAt
    && (!input.expireAt || input.graceExpireAt > input.expireAt)
    ? input.graceExpireAt
    : input.expireAt
  return input.whitelistAddonActive
    && (!input.status || ['ACTIVE', 'LIMITED'].includes(input.status))
    && (!effectiveSubscriptionExpireAt || effectiveSubscriptionExpireAt.getTime() > now.getTime())
    && Boolean(input.whitelistAddonExpireAt && input.whitelistAddonExpireAt.getTime() > now.getTime())
}

export function getWhitelistAddonRemainingSeconds(expireAt: Date | null | undefined, pausedAt: Date) {
  if (!expireAt) return 0n
  const remainingMs = expireAt.getTime() - pausedAt.getTime()
  return remainingMs > 0 ? BigInt(Math.ceil(remainingMs / SECOND_MS)) : 0n
}

export function getResumedWhitelistAddonExpireAt(resumedAt: Date, remainingSeconds: bigint) {
  const seconds = Number(remainingSeconds > 0n ? remainingSeconds : 0n)
  return new Date(resumedAt.getTime() + seconds * SECOND_MS)
}

export function isWhitelistAddonPaused(input: {
  whitelistAddonActive: boolean
  whitelistAddonRemainingSeconds?: bigint | null
}) {
  return !input.whitelistAddonActive && Boolean(
    input.whitelistAddonRemainingSeconds && input.whitelistAddonRemainingSeconds > 0n
  )
}

export function getWhitelistAddonPauseAt(input: {
  whitelistAddonPausedAt?: Date | null
  status?: string
  expireAt?: Date
  graceExpireAt?: Date | null
  updatedAt?: Date
}, now = new Date()) {
  if (input.whitelistAddonPausedAt) return input.whitelistAddonPausedAt
  const effectiveSubscriptionExpireAt = input.graceExpireAt
    && (!input.expireAt || input.graceExpireAt > input.expireAt)
    ? input.graceExpireAt
    : input.expireAt
  if (effectiveSubscriptionExpireAt && effectiveSubscriptionExpireAt < now) {
    return effectiveSubscriptionExpireAt
  }
  if (
    input.status
    && !['ACTIVE', 'LIMITED'].includes(input.status)
    && input.updatedAt
    && input.updatedAt < now
  ) {
    return input.updatedAt
  }
  return now
}

export function hasWhitelistAddonEntitlement(input: {
  whitelistAddonActive: boolean
  whitelistAddonExpireAt?: Date | null
  whitelistAddonRemainingSeconds?: bigint | null
  whitelistAddonPausedAt?: Date | null
  status?: string
  expireAt?: Date
  graceExpireAt?: Date | null
  updatedAt?: Date
}, now = new Date()) {
  if (input.whitelistAddonRemainingSeconds && input.whitelistAddonRemainingSeconds > 0n) return true
  if (!input.whitelistAddonActive || !input.whitelistAddonExpireAt) return false
  if (isWhitelistAddonCurrentlyActive(input, now)) return true

  const pausedAt = getWhitelistAddonPauseAt(input, now)
  return getWhitelistAddonRemainingSeconds(input.whitelistAddonExpireAt, pausedAt) > 0n
}
