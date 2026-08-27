import { describe, expect, it } from 'vitest'
import { calculatePersonalDiscount, calculateUserDiscount, preferUserDiscount } from './user-discounts'

describe('user discounts', () => {
  it('applies the persistent personal discount', () => {
    expect(calculatePersonalDiscount(30_000, 15)).toEqual({
      source: 'PERSONAL',
      discountPercent: 15,
      discountKopecks: 4_500,
      finalAmountKopecks: 25_500,
    })
  })

  it('selects a larger next-purchase discount', () => {
    expect(calculateUserDiscount(30_000, {
      personalDiscountPercent: 10,
      nextPurchaseDiscountPercent: 25,
    })?.source).toBe('NEXT_PURCHASE')
  })

  it('preserves a next-purchase discount when an equal promo code exists', () => {
    const userDiscount = calculateUserDiscount(30_000, {
      personalDiscountPercent: 0,
      nextPurchaseDiscountPercent: 20,
    })
    const promoDiscount = { discountPercent: 20, discountKopecks: 6_000, code: 'SAVE20' }

    expect(preferUserDiscount(userDiscount, promoDiscount)).toEqual({
      userDiscount: null,
      promoDiscount,
    })
  })

  it('keeps a persistent discount instead of consuming an equal promo code', () => {
    const userDiscount = calculatePersonalDiscount(30_000, 20)
    const promoDiscount = { discountPercent: 20, discountKopecks: 6_000, code: 'SAVE20' }

    expect(preferUserDiscount(userDiscount, promoDiscount)).toEqual({
      userDiscount,
      promoDiscount: null,
    })
  })
})
