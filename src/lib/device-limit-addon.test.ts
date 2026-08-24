import { describe, expect, it } from 'vitest'
import { calculateDeviceLimitAddon, readDeviceLimitAddonSnapshot } from './device-limit-addon'

describe('device limit addon', () => {
  it('charges only for additional devices and remaining subscription days', () => {
    const result = calculateDeviceLimitAddon({
      currentLimit: 3,
      targetLimit: 5,
      maxLimit: 10,
      extraDevicePriceKopecks: 10_000,
      durationDays: 30,
      now: new Date('2026-08-01T00:00:00.000Z'),
      expireAt: new Date('2026-08-16T00:00:00.000Z'),
    })

    expect(result).toEqual({ additionalDevices: 2, remainingDays: 15, priceKopecks: 10_000 })
  })

  it('rejects a limit that does not increase the current one', () => {
    expect(() => calculateDeviceLimitAddon({
      currentLimit: 5,
      targetLimit: 5,
      maxLimit: 10,
      extraDevicePriceKopecks: 10_000,
      durationDays: 30,
      expireAt: new Date(Date.now() + 86_400_000),
    })).toThrow('Выберите лимит больше текущего')
  })

  it('reads a valid frozen purchase snapshot', () => {
    expect(readDeviceLimitAddonSnapshot({
      type: 'DEVICE_LIMIT_ADDON',
      subscriptionId: 'sub-1',
      fromLimit: 3,
      toLimit: 4,
      additionalDevices: 1,
      remainingDays: 20,
      priceKopecks: 6_700,
    })).not.toBeNull()
  })
})
