import { describe, expect, it } from 'vitest'
import {
  getResumedWhitelistAddonExpireAt,
  getWhitelistAddonPauseAt,
  getWhitelistAddonRemainingSeconds,
  hasWhitelistAddonEntitlement,
  isWhitelistAddonCurrentlyActive,
} from './whitelist-addon-policy'

describe('whitelist add-on pause policy', () => {
  it('preserves exactly 20 days when the main subscription ends after 10 of 30 days', () => {
    const purchasedAt = new Date('2026-09-01T00:00:00.000Z')
    const addonExpireAt = new Date('2026-10-01T00:00:00.000Z')
    const subscriptionExpireAt = new Date('2026-09-11T00:00:00.000Z')

    const remaining = getWhitelistAddonRemainingSeconds(addonExpireAt, subscriptionExpireAt)

    expect(remaining).toBe(20n * 24n * 60n * 60n)
    expect(getResumedWhitelistAddonExpireAt(
      new Date('2026-12-01T00:00:00.000Z'),
      remaining
    )).toEqual(new Date('2026-12-21T00:00:00.000Z'))
    expect(getWhitelistAddonRemainingSeconds(
      new Date('2026-12-21T00:00:00.000Z'),
      new Date('2026-12-08T00:00:00.000Z')
    )).toBe(13n * 24n * 60n * 60n)
    expect(purchasedAt < subscriptionExpireAt).toBe(true)
  })

  it('keeps a paused balance through an arbitrarily long gap', () => {
    expect(hasWhitelistAddonEntitlement({
      whitelistAddonActive: false,
      whitelistAddonExpireAt: null,
      whitelistAddonRemainingSeconds: 13n * 24n * 60n * 60n,
      status: 'EXPIRED',
      expireAt: new Date('2026-09-11T00:00:00.000Z'),
    }, new Date('2027-09-11T00:00:00.000Z'))).toBe(true)
  })

  it('does not count the add-on as running without an active main subscription', () => {
    expect(isWhitelistAddonCurrentlyActive({
      whitelistAddonActive: true,
      whitelistAddonExpireAt: new Date('2026-10-01T00:00:00.000Z'),
      status: 'EXPIRED',
      expireAt: new Date('2026-09-11T00:00:00.000Z'),
    }, new Date('2026-09-12T00:00:00.000Z'))).toBe(false)
  })

  it('keeps the add-on running during an active grace period', () => {
    expect(isWhitelistAddonCurrentlyActive({
      whitelistAddonActive: true,
      whitelistAddonExpireAt: new Date('2026-10-01T00:00:00.000Z'),
      status: 'LIMITED',
      expireAt: new Date('2026-09-11T00:00:00.000Z'),
      graceExpireAt: new Date('2026-09-14T00:00:00.000Z'),
    }, new Date('2026-09-12T00:00:00.000Z'))).toBe(true)
  })

  it('uses the local status-change time when access was disabled before its expiry', () => {
    expect(getWhitelistAddonPauseAt({
      status: 'DISABLED',
      expireAt: new Date('2026-10-01T00:00:00.000Z'),
      updatedAt: new Date('2026-09-11T00:00:00.000Z'),
    }, new Date('2026-09-20T00:00:00.000Z'))).toEqual(
      new Date('2026-09-11T00:00:00.000Z')
    )
  })
})
