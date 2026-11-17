import { describe, expect, it } from 'vitest'
import { buildDeviceAddonOffer, buildWhitelistAddonOffer } from './subscription-addon-offers'

const now = new Date('2026-11-17T12:00:00.000Z')
const inDays = (days: number) => new Date(now.getTime() + days * 24 * 60 * 60 * 1000)

const plan = {
  whitelistAddonEnabled: true,
  whitelistAddonPriceKopecks: 9900,
  whitelistAddonInternalSquads: ['squad-1'],
  deviceAddonEnabled: true,
  unlimitedDevices: false,
  deviceLimit: 5,
  maxDeviceLimit: 20,
  extraDevicePriceKopecks: 10000,
  durationDays: 30,
}

function subscription(overrides: Record<string, unknown> = {}) {
  return {
    planId: 'plan-1',
    status: 'ACTIVE',
    expireAt: inDays(30),
    graceExpireAt: null,
    deviceLimit: 5,
    whitelistAddonActive: false,
    whitelistAddonExpireAt: null,
    whitelistAddonPausedAt: null,
    whitelistAddonRemainingSeconds: null,
    plan,
    ...overrides,
  } as Parameters<typeof buildWhitelistAddonOffer>[0]['subscriptions'][number] & Parameters<typeof buildDeviceAddonOffer>[0]['subscription'] & object
}

describe('whitelist add-on offer', () => {
  it('offers the add-on on an active subscription when the plan supports it', () => {
    expect(buildWhitelistAddonOffer({ subscriptions: [subscription()], usable: true, effectiveExpireAt: inDays(30), now })).toEqual({
      planId: 'plan-1',
      priceKopecks: 9900,
      active: false,
      expireAt: null,
      pausedRemainingSeconds: undefined,
    })
  })

  it('shows an active add-on with its end date', () => {
    const offer = buildWhitelistAddonOffer({
      subscriptions: [subscription({ whitelistAddonActive: true, whitelistAddonExpireAt: inDays(10) })],
      usable: true,
      effectiveExpireAt: inDays(30),
      now,
    })
    expect(offer?.active).toBe(true)
    expect(offer?.expireAt).toBe(inDays(10).toISOString())
  })

  it('keeps a paused add-on visible even when access cannot be bought now', () => {
    const offer = buildWhitelistAddonOffer({
      subscriptions: [subscription({ status: 'EXPIRED', expireAt: inDays(-1), whitelistAddonRemainingSeconds: 3600n })],
      usable: false,
      effectiveExpireAt: inDays(-1),
      now,
    })
    expect(offer?.pausedRemainingSeconds).toBe(3600)
  })

  it('hides the offer when the plan has no add-on or access is not usable', () => {
    const noAddon = subscription({ plan: { ...plan, whitelistAddonEnabled: false } })
    expect(buildWhitelistAddonOffer({ subscriptions: [noAddon], usable: true, effectiveExpireAt: inDays(30), now })).toBeNull()
    expect(buildWhitelistAddonOffer({ subscriptions: [subscription()], usable: false, effectiveExpireAt: inDays(30), now })).toBeNull()
    expect(buildWhitelistAddonOffer({ subscriptions: [], usable: true, effectiveExpireAt: inDays(30), now })).toBeNull()
  })
})

describe('device add-on offer', () => {
  it('offers extra devices below the plan maximum', () => {
    expect(buildDeviceAddonOffer({ subscription: subscription(), usable: true, expireAt: inDays(30), now })).toEqual({
      planId: 'plan-1',
      currentLimit: 5,
      maxLimit: 20,
      durationDays: 30,
      extraDevicePriceKopecks: 10000,
      expireAt: inDays(30).toISOString(),
    })
  })

  it('hides the offer at the maximum, for unlimited plans and for ended access', () => {
    expect(buildDeviceAddonOffer({ subscription: subscription({ deviceLimit: 20 }), usable: true, expireAt: inDays(30), now })).toBeNull()
    expect(buildDeviceAddonOffer({ subscription: subscription({ plan: { ...plan, unlimitedDevices: true } }), usable: true, expireAt: inDays(30), now })).toBeNull()
    expect(buildDeviceAddonOffer({ subscription: subscription(), usable: true, expireAt: inDays(-1), now })).toBeNull()
    expect(buildDeviceAddonOffer({ subscription: subscription({ status: 'DISABLED' }), usable: true, expireAt: inDays(30), now })).toBeNull()
    expect(buildDeviceAddonOffer({ subscription: null, usable: true, expireAt: inDays(30), now })).toBeNull()
  })
})
