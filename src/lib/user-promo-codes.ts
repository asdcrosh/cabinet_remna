import type { Plan } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { validatePromoCodeForPlan } from '@/lib/promo-codes'

export type AvailableUserPromoCode = {
  code: string
  discountPercent: number
  discountKopecks: number
  finalAmountKopecks: number
  source: 'BONUS_BOX' | 'WELCOME'
}

export async function getAvailableUserPromoCodesByPlan({
  userId,
  plans,
}: {
  userId: string
  plans: Array<Pick<Plan, 'id' | 'priceKopecks' | 'isPromo'>>
}) {
  const awardedCodes = await getAwardedPromoCodes(userId)
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

async function getAwardedPromoCodes(userId: string) {
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

  for (const opening of bonusOpenings) {
    const code = opening.promoCode?.code
    if (!code || seen.has(code)) continue
    seen.add(code)
    items.push({ code, source: 'BONUS_BOX' })
  }
  for (const redemption of welcomeRedemptions) {
    const code = redemption.promoCode?.code
    if (!code || seen.has(code)) continue
    seen.add(code)
    items.push({ code, source: 'WELCOME' })
  }

  return items
}
