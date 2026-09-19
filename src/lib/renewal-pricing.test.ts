import { describe, expect, it } from 'vitest'
import { calculateRenewalPricing, tryCalculateRenewalPricing } from './renewal-pricing'

const plan = {
  priceKopecks: 13_000,
  deviceLimit: 5,
  maxDeviceLimit: 20,
  extraDevicePriceKopecks: 10_000,
}

describe('renewal pricing', () => {
  it('uses the recurring personal discount only on the base plan', () => {
    expect(calculateRenewalPricing(plan, 8, 10, 7_000)).toMatchObject({
      originalAmountKopecks: 43_000,
      discountKopecks: 1_300,
      addonPriceKopecks: 7_000,
      totalAmountKopecks: 48_700,
    })
  })

  it('rejects an invalid device limit without inventing a price', () => {
    expect(tryCalculateRenewalPricing(plan, 21, 10)).toBeNull()
  })
})
