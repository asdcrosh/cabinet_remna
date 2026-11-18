// Быстрое создание промокода прямо из формы предложения или приветственного бонуса
// (новый дизайн). Создаётся обычный промокод через тот же POST /api/admin/promo-codes:
// без срока и лимитов, на все тарифы. Тонкие условия меняются потом в «Промокодах».

export type QuickPromoAudience = 'ALL' | 'NEW_USERS' | 'NO_ACTIVE_SUBSCRIPTION'

export const QUICK_PROMO_AUDIENCES: Array<{ value: QuickPromoAudience; label: string }> = [
  { value: 'ALL', label: 'Всем пользователям' },
  { value: 'NEW_USERS', label: 'Новым пользователям' },
  { value: 'NO_ACTIVE_SUBSCRIPTION', label: 'Без активной подписки' },
]

export type QuickPromoDraft = {
  code: string
  discountPercent: string
  audience: QuickPromoAudience
}

export type QuickPromoOption = { id: string; code: string; discountPercent: number }

export type QuickPromoPayload = {
  code: string
  discountPercent: number
  audience: QuickPromoAudience
  purchaseScope: 'ANY'
  allowedEmails: string[]
  isActive: true
  startsAt: null
  expiresAt: null
  maxUses: null
  maxUsesPerUser: 1
  planIds: string[]
}

const PROMO_CODE_PATTERN = /^[A-Z0-9_-]+$/

/** Подсказка кода по скидке: WELCOME + 15 → WELCOME15. */
export function suggestQuickPromoCode(prefix: string, discountPercent: string) {
  const digits = discountPercent.replace(/\D/g, '').slice(0, 2)
  return `${prefix.toUpperCase()}${digits}`
}

/** Те же правила, что у adminPromoCodeSchema, чтобы ошибка была видна до запроса. */
export function buildQuickPromoCodePayload(
  draft: QuickPromoDraft
): { ok: true; payload: QuickPromoPayload } | { ok: false; error: string } {
  const code = draft.code.trim().toUpperCase()
  if (code.length < 3) return { ok: false, error: 'Код — минимум 3 символа' }
  if (code.length > 32) return { ok: false, error: 'Код — максимум 32 символа' }
  if (!PROMO_CODE_PATTERN.test(code)) {
    return { ok: false, error: 'В коде только латиница, цифры, дефис и подчёркивание' }
  }

  const discountPercent = Number(draft.discountPercent)
  if (!Number.isInteger(discountPercent) || discountPercent < 1 || discountPercent > 99) {
    return { ok: false, error: 'Скидка — целое число от 1 до 99%' }
  }

  return {
    ok: true,
    payload: {
      code,
      discountPercent,
      audience: draft.audience,
      purchaseScope: 'ANY',
      allowedEmails: [],
      isActive: true,
      startsAt: null,
      expiresAt: null,
      maxUses: null,
      maxUsesPerUser: 1,
      planIds: [],
    },
  }
}

/** Только что созданные коды — первыми, без дублей после обновления страницы. */
export function mergeQuickPromoOptions(created: QuickPromoOption[], existing: QuickPromoOption[]) {
  const seen = new Set<string>()
  return [...created, ...existing].filter((option) => {
    if (seen.has(option.id)) return false
    seen.add(option.id)
    return true
  })
}
