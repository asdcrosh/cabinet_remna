import { describe, expect, it } from 'vitest'
import { buildWhitelistRewardGrant, whitelistRewardTimeLeft } from './whitelist-addon-rewards'

const day = 86400_000
const now = new Date('2026-10-23T12:00:00Z')

describe('whitelist reward time', () => {
  it('extends paid access, preserving its squads and payment ownership', () => {
    const paid = { whitelistAddonActive: true, whitelistAddonExpireAt: new Date(+now + 10 * day),
      whitelistAddonPaymentId: 'paid', whitelistAddonInternalSquads: ['paid-squad'] }
    const result = { ...paid, ...buildWhitelistRewardGrant(paid, 7, ['prize-squad'], now) }
    expect(result.whitelistAddonExpireAt).toEqual(new Date(+now + 17 * day))
    expect(result.whitelistAddonPaymentId).toBe('paid')
    expect(result.whitelistAddonInternalSquads).toEqual(['paid-squad', 'prize-squad'])
    expect(result.whitelistAddonRewardSeconds).toBe(7n * 86400n)
    // Paid time is spent first. A refund during the reward period keeps only unused reward time.
    expect(whitelistRewardTimeLeft(result, new Date(+now + 12 * day))).toBe(5n * 86400n)
  })

  it('accumulates repeat wins without reviving already consumed reward time', () => {
    const first = buildWhitelistRewardGrant({ whitelistAddonActive: false }, 3, ['one'], now)
    const second = buildWhitelistRewardGrant(first, 7, ['two', 'one'], new Date(+now + 2 * day))
    expect(second.whitelistAddonExpireAt).toEqual(new Date(+now + 10 * day))
    expect(second.whitelistAddonRewardSeconds).toBe(8n * 86400n)
    expect(second.whitelistAddonRewardSquads).toEqual(['one', 'two'])
  })

  it('does not restore an expired prize when another prize is won later', () => {
    const first = buildWhitelistRewardGrant({ whitelistAddonActive: false }, 3, ['old'], now)
    const later = new Date(+now + 10 * day)
    const second = buildWhitelistRewardGrant(first, 1, ['new'], later)
    expect(second.whitelistAddonExpireAt).toEqual(new Date(+later + day))
    expect(second.whitelistAddonRewardSquads).toEqual(['new'])
    expect(second.whitelistAddonInternalSquads).toEqual(['new'])
  })

  it('preserves reward time while the main subscription is paused', () => {
    expect(whitelistRewardTimeLeft({ whitelistAddonActive: false,
      whitelistAddonRemainingSeconds: 20n * 86400n, whitelistAddonRewardSeconds: 7n * 86400n }, now))
      .toBe(7n * 86400n)
  })
})
