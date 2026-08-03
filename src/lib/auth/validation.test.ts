import { describe, expect, it } from 'vitest'
import { adminPlanSchema, adminPromoCodeSchema, registerSchema, telegramMiniAppEmailSchema } from './validation'

const baseInput = {
  email: 'user@example.com',
  password: 'Password1',
  agreeToTerms: true,
  agreeToPersonalData: true,
}

describe('auth validation', () => {
  it('requires separate terms and personal data confirmations', () => {
    expect(registerSchema.safeParse({ ...baseInput, agreeToTerms: false }).success).toBe(false)
    expect(registerSchema.safeParse({ ...baseInput, agreeToPersonalData: false }).success).toBe(false)
  })

  it('accepts normal names', () => {
    expect(registerSchema.safeParse({ ...baseInput, name: 'Артем Алексеев' }).success).toBe(true)
    expect(registerSchema.safeParse({ ...baseInput, name: "Anne-Marie O'Neil" }).success).toBe(true)
  })

  it('rejects noisy names', () => {
    expect(registerSchema.safeParse({ ...baseInput, name: 'A' }).success).toBe(false)
    expect(registerSchema.safeParse({ ...baseInput, name: 'Артем123' }).success).toBe(false)
    expect(registerSchema.safeParse({ ...baseInput, name: 'Артем  Алексеев' }).success).toBe(true)
    expect(registerSchema.safeParse({ ...baseInput, name: 'Артем--Алексеев' }).success).toBe(false)
    expect(registerSchema.safeParse({ ...baseInput, name: 'A'.repeat(41) }).success).toBe(false)
  })

  it('accepts an existing account password for Telegram account linking', () => {
    expect(
      telegramMiniAppEmailSchema.safeParse({
        email: 'telegram@example.com',
        password: 'old-password',
        agreeToTerms: true,
        agreeToPersonalData: true,
      }).success
    ).toBe(true)
    expect(
      telegramMiniAppEmailSchema.safeParse({
        email: 'telegram@example.com',
        password: '',
        agreeToTerms: true,
        agreeToPersonalData: true,
      }).success
    ).toBe(false)
  })

  it('allows zero price only for promo plans', () => {
    const plan = {
      name: 'Тестовый тариф',
      description: null,
      priceKopecks: 0,
      durationDays: 7,
      trafficLimitGb: 10,
      deviceLimit: 1,
      activeInternalSquads: [],
      availability: 'ALL',
      allowedEmails: [],
      allowedTelegramIds: [],
      isPromo: false,
      isFeatured: false,
      isActive: true,
      sortOrder: 0,
    }

    expect(adminPlanSchema.safeParse(plan).success).toBe(false)
    expect(adminPlanSchema.safeParse({ ...plan, isPromo: true }).success).toBe(true)
    expect(adminPlanSchema.safeParse({ ...plan, priceKopecks: 10_000 }).success).toBe(true)
  })

  it('accepts renewal-only promo codes and rejects incompatible audiences', () => {
    const promoCode = {
      code: 'RENEW20',
      discountPercent: 20,
      audience: 'ALL',
      purchaseScope: 'RENEWAL_ONLY',
      allowedEmails: [],
      isActive: true,
      startsAt: null,
      expiresAt: null,
      maxUses: null,
      maxUsesPerUser: 1,
      planIds: [],
    }

    expect(adminPromoCodeSchema.safeParse(promoCode).success).toBe(true)
    expect(adminPromoCodeSchema.safeParse({ ...promoCode, audience: 'NEW_USERS' }).success).toBe(false)
    expect(adminPromoCodeSchema.safeParse({ ...promoCode, audience: 'NO_ACTIVE_SUBSCRIPTION' }).success).toBe(false)
  })
})
