import type { Plan } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { validatePromoCodeForPlan } from '@/lib/promo-codes'
import { cleanupExpiredBonusBoxPromoCodes } from '@/lib/promo-code-cleanup'

export type AvailableUserPromoCode = {
  code: string
  discountPercent: number
  discountKopecks: number
  finalAmountKopecks: number
  source: 'BONUS_BOX' | 'WELCOME' | 'LINK'
}

export async function getAvailableUserPromoCodesByPlan({
  userId,
  plans,
  linkPromoCode,
}: {
  userId: string
  plans: Array<Pick<Plan, 'id' | 'priceKopecks' | 'isPromo'>>
  linkPromoCode?: string | null
}) {
  await cleanupExpiredBonusBoxPromoCodes()
  const awardedCodes = await getAwardedPromoCodes(userId, linkPromoCode)
  const result = new Map<string, AvailableUserPromoCode[]>()

  await Promise.all(plans.map(async (plan) => {
    if (plan.isPromo) {
      result.set(plan.id, [])
      return
    }

    const available: AvailableUserPromoCode[] = []
    for (const item of awardedCodes) {
      try {
        const discount = await validatePromoCodeForPlan({
          prisma,
          code: item.code,
          userId,
          plan,
        })
        available.push({
          code: discount.normalizedCode,
          discountPercent: discount.discountPercent,
          discountKopecks: discount.discountKopecks,
          finalAmountKopecks: discount.finalAmountKopecks,
          source: item.source,
        })
      } catch {
        // Недоступные для тарифа или уже использованные коды не показываем.
      }
    }
    result.set(plan.id, available)
  }))

  return result
}

async function getAwardedPromoCodes(userId: string, linkPromoCode?: string | null) {
  const [bonusOpenings, welcomeRedemptions] = await Promise.all([
    prisma.bonusBoxOpening.findMany({
      where: { userId, promoCodeId: { not: null } },
      include: { promoCode: { select: { code: true } } },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.welcomeBonusRedemption.findMany({
      where: { userId, promoCodeId: { not: null } },
      include: { promoCode: { select: { code: true } } },
      orderBy: { createdAt: 'desc' },
    }),
  ])

  const seen = new Set<string>()
  const items: Array<{ code: string; source: AvailableUserPromoCode['source'] }> = []
  const normalizedLinkCode = linkPromoCode?.trim()

  if (normalizedLinkCode) {
    seen.add(normalizedLinkCode.toUpperCase())
    items.push({ code: normalizedLinkCode, source: 'LINK' })
  }

  for (const opening of bonusOpenings) {
    const code = opening.promoCode?.code
    const normalizedCode = code?.toUpperCase()
    if (!code || !normalizedCode || seen.has(normalizedCode)) continue
    seen.add(normalizedCode)
    items.push({ code, source: 'BONUS_BOX' })
  }
  for (const redemption of welcomeRedemptions) {
    const code = redemption.promoCode?.code
    const normalizedCode = code?.toUpperCase()
    if (!code || !normalizedCode || seen.has(normalizedCode)) continue
    seen.add(normalizedCode)
    items.push({ code, source: 'WELCOME' })
  }

  return items
}
