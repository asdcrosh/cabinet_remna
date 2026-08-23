export const WHITELIST_ADDON_DURATION_DAYS = 30
const DAY_MS = 24 * 60 * 60 * 1000

export function getWhitelistAddonExpireAt(activatedAt: Date) {
  return new Date(activatedAt.getTime() + WHITELIST_ADDON_DURATION_DAYS * DAY_MS)
}

export function isWhitelistAddonCurrentlyActive(input: {
  whitelistAddonActive: boolean
  whitelistAddonExpireAt?: Date | null
}, now = new Date()) {
  return input.whitelistAddonActive
    && Boolean(input.whitelistAddonExpireAt && input.whitelistAddonExpireAt.getTime() > now.getTime())
}
