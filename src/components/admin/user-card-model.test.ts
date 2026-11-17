import { describe, expect, it } from 'vitest'
import {
  buildUserCardHref,
  findActiveSubscription,
  formatSubscriptionDeviceLimit,
  formatSubscriptionTraffic,
  formatUserCardAccountLabel,
  getUserCardPermissions,
  getWhitelistAddonState,
  hasVpnProfile,
  isWhitelistAddonActive,
  parseUserCardTab,
  pickCurrentSubscription,
  userCardRoleLabel,
} from './user-card-model'

const now = new Date('2026-11-17T12:00:00.000Z')
const future = new Date('2026-12-17T12:00:00.000Z')
const past = new Date('2026-10-17T12:00:00.000Z')

describe('user card tabs', () => {
  it('defaults to the subscription tab for unknown values', () => {
    expect(parseUserCardTab(undefined, { canViewHistory: true })).toBe('subscription')
    expect(parseUserCardTab('unknown', { canViewHistory: true })).toBe('subscription')
    expect(parseUserCardTab(['payments', 'devices'], { canViewHistory: false })).toBe('payments')
  })

  it('hides history from roles that cannot open the audit log', () => {
    expect(parseUserCardTab('history', { canViewHistory: false })).toBe('subscription')
    expect(parseUserCardTab('history', { canViewHistory: true })).toBe('history')
  })

  it('omits the default tab from the URL', () => {
    expect(buildUserCardHref('user-1')).toBe('/dashboard/admin/users/user-1')
    expect(buildUserCardHref('user-1', 'subscription')).toBe('/dashboard/admin/users/user-1')
    expect(buildUserCardHref('user-1', 'support')).toBe('/dashboard/admin/users/user-1?tab=support')
  })
})

describe('user card permissions', () => {
  it('lets admins manage regular users but not super admins', () => {
    expect(getUserCardPermissions({ actorRole: 'ADMIN', targetRole: 'USER', latestSubscriptionStatus: 'ACTIVE' })).toEqual({
      canManageUser: true,
      canGrantBonusAttempts: false,
      canManageWhitelistAddon: false,
      canManageDiscounts: false,
      canViewHistory: false,
      canDisableSubscription: true,
    })
    expect(getUserCardPermissions({ actorRole: 'ADMIN', targetRole: 'SUPER_ADMIN', latestSubscriptionStatus: 'ACTIVE' })).toMatchObject({
      canManageUser: false,
      canDisableSubscription: false,
    })
  })

  it('gives super admins every action', () => {
    expect(getUserCardPermissions({ actorRole: 'SUPER_ADMIN', targetRole: 'SUPER_ADMIN', latestSubscriptionStatus: 'LIMITED' })).toEqual({
      canManageUser: true,
      canGrantBonusAttempts: true,
      canManageWhitelistAddon: true,
      canManageDiscounts: true,
      canViewHistory: true,
      canDisableSubscription: true,
    })
  })

  it('offers disabling only for an active or limited latest subscription', () => {
    expect(getUserCardPermissions({ actorRole: 'ADMIN', targetRole: 'USER', latestSubscriptionStatus: 'EXPIRED' }).canDisableSubscription).toBe(false)
    expect(getUserCardPermissions({ actorRole: 'ADMIN', targetRole: 'USER', latestSubscriptionStatus: null }).canDisableSubscription).toBe(false)
  })
})

describe('user card account label', () => {
  it('shows the real email', () => {
    expect(formatUserCardAccountLabel({ email: 'user@example.com', telegramUsername: 'nick', telegramId: 1n })).toBe('user@example.com')
  })

  it('shows the Telegram handle for technical emails', () => {
    expect(formatUserCardAccountLabel({ email: 'telegram-42@pending.invalid', telegramUsername: 'nick', telegramId: 42n })).toBe('@nick')
    expect(formatUserCardAccountLabel({ email: 'telegram-42@pending.invalid', telegramUsername: null, telegramId: 42n })).toBe('@42')
  })

  it('falls back to the technical email when there is no Telegram identity', () => {
    expect(formatUserCardAccountLabel({ email: 'merged-1@pending.invalid', telegramUsername: null, telegramId: null })).toBe('merged-1@pending.invalid')
  })
})

describe('user card subscriptions', () => {
  const expired = { id: 'expired', status: 'EXPIRED', expireAt: future }
  const active = { id: 'active', status: 'ACTIVE', expireAt: future }
  const stale = { id: 'stale', status: 'ACTIVE', expireAt: past }

  it('prefers an active subscription and falls back to the latest one', () => {
    expect(pickCurrentSubscription([expired, active], now)?.id).toBe('active')
    expect(pickCurrentSubscription([expired, stale], now)?.id).toBe('expired')
    expect(pickCurrentSubscription([], now)).toBeUndefined()
    expect(findActiveSubscription([expired, stale], now)).toBeUndefined()
  })

  it('treats whitelist add-on as active only before expiry', () => {
    expect(isWhitelistAddonActive({ whitelistAddonActive: true, whitelistAddonExpireAt: future }, now)).toBe(true)
    expect(isWhitelistAddonActive({ whitelistAddonActive: true, whitelistAddonExpireAt: past }, now)).toBe(false)
    expect(isWhitelistAddonActive({ whitelistAddonActive: false, whitelistAddonExpireAt: future }, now)).toBe(false)
    expect(isWhitelistAddonActive(undefined, now)).toBe(false)
  })

  it('reports a paused whitelist add-on before checking expiry', () => {
    expect(getWhitelistAddonState({ whitelistAddonActive: false, whitelistAddonExpireAt: null, whitelistAddonRemainingSeconds: 3600n }, now)).toBe('PAUSED')
    expect(getWhitelistAddonState({ whitelistAddonActive: true, whitelistAddonExpireAt: future, whitelistAddonRemainingSeconds: null }, now)).toBe('ACTIVE')
    expect(getWhitelistAddonState({ whitelistAddonActive: true, whitelistAddonExpireAt: past, whitelistAddonRemainingSeconds: 0n }, now)).toBe('NONE')
  })

  it('formats device limits like the subscription page', () => {
    expect(formatSubscriptionDeviceLimit({ deviceLimit: 3, plan: { deviceLimit: 5, unlimitedDevices: false } })).toBe('3')
    expect(formatSubscriptionDeviceLimit({ deviceLimit: null, plan: { deviceLimit: 5, unlimitedDevices: false } })).toBe('5')
    expect(formatSubscriptionDeviceLimit({ deviceLimit: 3, plan: { deviceLimit: 5, unlimitedDevices: true } })).toBe('Без лимита')
    expect(formatSubscriptionDeviceLimit({ deviceLimit: null, plan: null })).toBe('—')
  })

  it('formats traffic with and without a limit', () => {
    expect(formatSubscriptionTraffic(1024n ** 3n, 10n * 1024n ** 3n)).toBe('1.00 GB из 10.00 GB')
    expect(formatSubscriptionTraffic(0n, null)).toBe('0 B · безлимит')
  })
})

describe('user card labels', () => {
  it('detects a VPN profile by any Remnawave identifier', () => {
    expect(hasVpnProfile({ remnawaveId: null, remnawaveUuid: null, remnawaveUsername: null })).toBe(false)
    expect(hasVpnProfile({ remnawaveId: null, remnawaveUuid: 'uuid', remnawaveUsername: null })).toBe(true)
  })

  it('labels roles in Russian', () => {
    expect(userCardRoleLabel('SUPER_ADMIN')).toBe('Главный администратор')
    expect(userCardRoleLabel('CUSTOM')).toBe('CUSTOM')
  })
})
