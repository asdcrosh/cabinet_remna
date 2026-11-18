import { describe, expect, it } from 'vitest'
import {
  buildQuickPromoCodePayload,
  mergeQuickPromoOptions,
  suggestQuickPromoCode,
} from './admin-quick-promo'
import { adminPromoCodeSchema } from './auth/validation'

describe('quick promo code from offer forms', () => {
  it('suggests a code from the prefix and discount', () => {
    expect(suggestQuickPromoCode('welcome', '15')).toBe('WELCOME15')
    expect(suggestQuickPromoCode('COMEBACK', '7%')).toBe('COMEBACK7')
    expect(suggestQuickPromoCode('COMEBACK', '')).toBe('COMEBACK')
  })

  it('builds a plain promo: no dates, no total limit, all plans, one use per user', () => {
    const result = buildQuickPromoCodePayload({ code: ' welcome15 ', discountPercent: '15', audience: 'NEW_USERS' })
    expect(result).toEqual({
      ok: true,
      payload: {
        code: 'WELCOME15',
        discountPercent: 15,
        audience: 'NEW_USERS',
        purchaseScope: 'ANY',
        allowedEmails: [],
        isActive: true,
        startsAt: null,
        expiresAt: null,
        maxUses: null,
        maxUsesPerUser: 1,
        planIds: [],
      },
    })
  })

  it('produces exactly what the existing promo API accepts', () => {
    const result = buildQuickPromoCodePayload({ code: 'COMEBACK20', discountPercent: '20', audience: 'NO_ACTIVE_SUBSCRIPTION' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(adminPromoCodeSchema.safeParse(result.payload).success).toBe(true)
  })

  it('rejects what the API would reject, before the request', () => {
    expect(buildQuickPromoCodePayload({ code: 'AB', discountPercent: '10', audience: 'ALL' }))
      .toEqual({ ok: false, error: 'Код — минимум 3 символа' })
    expect(buildQuickPromoCodePayload({ code: 'СКИДКА10', discountPercent: '10', audience: 'ALL' }).ok).toBe(false)
    expect(buildQuickPromoCodePayload({ code: 'X'.repeat(33), discountPercent: '10', audience: 'ALL' }).ok).toBe(false)
    expect(buildQuickPromoCodePayload({ code: 'SALE', discountPercent: '0', audience: 'ALL' }).ok).toBe(false)
    expect(buildQuickPromoCodePayload({ code: 'SALE', discountPercent: '100', audience: 'ALL' }).ok).toBe(false)
    expect(buildQuickPromoCodePayload({ code: 'SALE', discountPercent: '12.5', audience: 'ALL' }).ok).toBe(false)
  })

  it('puts just-created codes first and drops duplicates after the page refreshes', () => {
    const created = [{ id: 'new', code: 'NEW10', discountPercent: 10 }]
    const existing = [
      { id: 'old', code: 'OLD20', discountPercent: 20 },
      { id: 'new', code: 'NEW10', discountPercent: 10 },
    ]
    expect(mergeQuickPromoOptions(created, existing).map((item) => item.id)).toEqual(['new', 'old'])
  })
})
