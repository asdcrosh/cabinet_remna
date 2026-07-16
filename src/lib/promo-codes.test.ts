import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  calculatePercentDiscount,
  normalizePromoCode,
  validatePromoCodeForPlan,
} from './promo-codes'

const prisma = {
  promoCode: {
    findUnique: vi.fn(),
  },
  promoCodeRedemption: {
    count: vi.fn(),
  },
  user: {
    findUnique: vi.fn(),
  },
  subscription: {
    count: vi.fn(),
  },
  payment: {
    count: vi.fn(),
  },
} as any

const plan = {
  id: 'plan-1',
  priceKopecks: 10000,
  promoCodesEnabled: true,
}

function promoCode(overrides: Record<string, unknown> = {}) {
  return {
    id: 'promo-1',
    code: 'SALE20',
    discountPercent: 20,
    audience: 'ALL',
    allowedEmails: [],
    isActive: true,
    startsAt: null,
    expiresAt: null,
    maxUses: null,
    maxUsesPerUser: 1,
    plans: [],
    ...overrides,
  }
}

describe('promo code helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('normalizes promo codes', () => {
    expect(normalizePromoCode(' sale20 ')).toBe('SALE20')
    expect(normalizePromoCode('   ')).toBeNull()
  })

  it('calculates percent discount and keeps minimum YooKassa amount', () => {
    expect(calculatePercentDiscount(10000, 20)).toEqual({
      discountKopecks: 2000,
      finalAmountKopecks: 8000,
    })
    expect(calculatePercentDiscount(150, 99)).toEqual({
      discountKopecks: 50,
      finalAmountKopecks: 100,
    })
  })

  it('returns a valid discount for an active promo code', async () => {
    prisma.promoCode.findUnique.mockResolvedValue(promoCode())
    prisma.promoCodeRedemption.count.mockResolvedValue(0)

    const result = await validatePromoCodeForPlan({
      prisma,
      code: 'sale20',
      userId: 'user-1',
      plan,
      now: new Date('2026-01-01T00:00:00.000Z'),
    })

    expect(result.normalizedCode).toBe('SALE20')
    expect(result.discountKopecks).toBe(2000)
    expect(result.finalAmountKopecks).toBe(8000)
  })

  it('rejects an expired promo code', async () => {
    prisma.promoCode.findUnique.mockResolvedValue(
      promoCode({ expiresAt: new Date('2025-12-31T00:00:00.000Z') })
    )

    await expect(
      validatePromoCodeForPlan({
        prisma,
        code: 'SALE20',
        userId: 'user-1',
        plan,
        now: new Date('2026-01-01T00:00:00.000Z'),
      })
    ).rejects.toMatchObject({ code: 'PROMO_EXPIRED' })
  })

  it('rejects a promo code for another plan', async () => {
    prisma.promoCode.findUnique.mockResolvedValue(
      promoCode({ plans: [{ planId: 'plan-2' }] })
    )

    await expect(
      validatePromoCodeForPlan({
        prisma,
        code: 'SALE20',
        userId: 'user-1',
        plan,
      })
    ).rejects.toMatchObject({ code: 'PROMO_PLAN_NOT_ALLOWED' })
  })

  it('rejects all promo codes when the plan disables discounts', async () => {
    await expect(
      validatePromoCodeForPlan({
        prisma,
        code: 'SALE20',
        userId: 'user-1',
        plan: { ...plan, promoCodesEnabled: false },
      })
    ).rejects.toMatchObject({ code: 'PROMO_DISABLED_FOR_PLAN' })

    expect(prisma.promoCode.findUnique).not.toHaveBeenCalled()
  })

  it('rejects a promo code when total limit is reached', async () => {
    prisma.promoCode.findUnique.mockResolvedValue(promoCode({ maxUses: 2 }))
    prisma.promoCodeRedemption.count.mockResolvedValueOnce(2).mockResolvedValueOnce(0)

    await expect(
      validatePromoCodeForPlan({
        prisma,
        code: 'SALE20',
        userId: 'user-1',
        plan,
      })
    ).rejects.toMatchObject({ code: 'PROMO_LIMIT_REACHED' })
  })

  it('rejects a promo code when user limit is reached', async () => {
    prisma.promoCode.findUnique.mockResolvedValue(promoCode({ maxUsesPerUser: 1 }))
    prisma.promoCodeRedemption.count.mockResolvedValue(1)

    await expect(
      validatePromoCodeForPlan({
        prisma,
        code: 'SALE20',
        userId: 'user-1',
        plan,
      })
    ).rejects.toMatchObject({ code: 'PROMO_USER_LIMIT_REACHED' })
  })

  it('rejects a personal promo code for another user', async () => {
    prisma.promoCode.findUnique.mockResolvedValue(
      promoCode({ audience: 'PERSONAL', allowedEmails: ['vip@example.com'] })
    )
    prisma.user.findUnique.mockResolvedValue({
      email: 'user@example.com',
      remnashopUserId: null,
      remnawaveUuid: null,
    })

    await expect(
      validatePromoCodeForPlan({
        prisma,
        code: 'SALE20',
        userId: 'user-1',
        plan,
      })
    ).rejects.toMatchObject({ code: 'PROMO_USER_NOT_ALLOWED' })
  })

  it('rejects a new-user promo code for an existing user', async () => {
    prisma.promoCode.findUnique.mockResolvedValue(promoCode({ audience: 'NEW_USERS' }))
    prisma.user.findUnique.mockResolvedValue({
      email: 'user@example.com',
      remnashopUserId: null,
    })
    prisma.subscription.count.mockResolvedValue(0)
    prisma.payment.count.mockResolvedValue(1)

    await expect(
      validatePromoCodeForPlan({
        prisma,
        code: 'SALE20',
        userId: 'user-1',
        plan,
      })
    ).rejects.toMatchObject({ code: 'PROMO_NEW_USERS_ONLY' })
  })

  it('allows a new-user promo code for a remnashop account without purchases', async () => {
    prisma.promoCode.findUnique.mockResolvedValue(promoCode({ audience: 'NEW_USERS' }))
    prisma.user.findUnique.mockResolvedValue({
      email: 'user@example.com',
      remnashopUserId: 42,
    })
    prisma.subscription.count.mockResolvedValue(0)
    prisma.payment.count.mockResolvedValue(0)
    prisma.promoCodeRedemption.count.mockResolvedValue(0)

    const result = await validatePromoCodeForPlan({
      prisma,
      code: 'SALE20',
      userId: 'user-1',
      plan,
    })

    expect(result.normalizedCode).toBe('SALE20')
  })

  it('rejects a no-active-subscription promo code for active subscribers', async () => {
    prisma.promoCode.findUnique.mockResolvedValue(promoCode({ audience: 'NO_ACTIVE_SUBSCRIPTION' }))
    prisma.user.findUnique.mockResolvedValue({
      email: 'user@example.com',
      remnashopUserId: null,
    })
    prisma.subscription.count.mockResolvedValue(1)

    await expect(
      validatePromoCodeForPlan({
        prisma,
        code: 'SALE20',
        userId: 'user-1',
        plan,
      })
    ).rejects.toMatchObject({ code: 'PROMO_NO_ACTIVE_SUBSCRIPTION_ONLY' })
  })
})
