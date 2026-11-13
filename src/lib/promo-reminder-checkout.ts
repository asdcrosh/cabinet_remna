import type { Prisma } from '@prisma/client'
import { hasVerifiedEmail } from './auth/mobile-email-policy'
import { getPlanAudienceContext, isPlanAvailableForUser } from './plan-access'
import { prisma } from './prisma'
import { PromoCodeError, validatePromoCodeForPlan } from './promo-codes'
import { remnashopQuery } from './remnashop-db'
import { calculateUserDiscount, preferUserDiscount } from './user-discounts'

const IN_USE = ['PENDING', 'SUCCEEDED'] as const
const NOT_AVAILABLE = 'Промокод больше недоступен'

export function promoReminderRecipients(id: string, allowedEmails: string[]): Prisma.UserWhereInput {
  const emails = allowedEmails.map((email) => email.trim().toLowerCase()).filter(Boolean)
  return {
    OR: [
      { bonusBoxOpenings: { some: { promoCodeId: id } } },
      { welcomeBonusRedemptions: { some: { promoCodeId: id, type: 'PROMO_CODE' } } },
      { promoCodeMerges: { some: { resultPromoCodeId: id } } },
      ...(emails.length > 0 ? [{ email: { in: emails, mode: 'insensitive' as const } }] : []),
    ],
  }
}

export function isPromoReminderId(id: string): boolean {
  return /^[A-Za-z0-9_-]{1,80}$/.test(id)
}

export async function resolvePromoReminderCheckout(userId: string, promoId: string, now = new Date()) {
  if (!isPromoReminderId(promoId)) return { error: NOT_AVAILABLE }

  const promo = await prisma.promoCode.findUnique({ where: { id: promoId } })
  if (!promo) return { error: NOT_AVAILABLE }
  const user = await prisma.user.findFirst({
    where: { id: userId, ...promoReminderRecipients(promo.id, promo.audience === 'PERSONAL' ? promo.allowedEmails : []) },
    select: {
      email: true,
      emailVerifiedAt: true,
      personalDiscountPercent: true,
      nextPurchaseDiscountPercent: true,
      remnashopUserId: true,
    },
  })
  if (!user) return { error: NOT_AVAILABLE }
  if (promo.expiresAt && promo.expiresAt <= now) return { error: 'Срок действия промокода истёк' }
  if (!promo.isActive || !promo.expiresAt || (promo.startsAt && promo.startsAt > now)) {
    return { error: NOT_AVAILABLE }
  }
  if (!hasVerifiedEmail(user)) return { error: 'Подтвердите email перед оплатой' }

  const inUse = await prisma.promoCodeRedemption.findFirst({
    where: { promoCodeId: promo.id, userId, status: { in: [...IN_USE] } },
    select: { status: true },
    orderBy: { status: 'desc' },
  })
  if (inUse) {
    return {
      error: inUse.status === 'PENDING'
        ? 'Промокод уже применяется в незавершённой оплате'
        : 'Промокод уже использован',
    }
  }

  if (promo.remnashopPromoCodeId != null && process.env.REMNASHOP_DATABASE_URL) {
    const localUses = promo.maxUses == null ? [] : await prisma.promoCodeRedemption.findMany({
      where: { promoCodeId: promo.id, status: { in: [...IN_USE] } },
      select: { status: true, user: { select: { remnashopUserId: true } } },
    })
    const syncedUsers = localUses.flatMap((use) =>
      use.status === 'SUCCEEDED' && use.user.remnashopUserId != null ? [use.user.remnashopUserId] : [],
    )
    const { rows: [usage] } = await remnashopQuery<{ used: boolean; other_uses: number }>(
      `SELECT COALESCE(bool_or(user_id = $2::int), false) AS used,
        count(*) FILTER (WHERE NOT (user_id = ANY($3::int[])))::int AS other_uses
      FROM promocode_activations WHERE promocode_id = $1`,
      [promo.remnashopPromoCodeId, user.remnashopUserId, syncedUsers],
    )
    if (usage?.used) return { error: 'Промокод уже использован' }
    if (promo.maxUses != null && localUses.length + (usage?.other_uses ?? 0) >= promo.maxUses) {
      return { error: 'Лимит использований промокода исчерпан' }
    }
  }

  const [audience, plans] = await Promise.all([
    getPlanAudienceContext(userId),
    prisma.plan.findMany({
      where: { isActive: true, isPromo: false, promoCodesEnabled: true },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      select: {
        id: true, priceKopecks: true, promoCodesEnabled: true,
        availability: true, allowedEmails: true, allowedTelegramIds: true,
      },
    }),
  ])
  if (!audience) return { error: NOT_AVAILABLE }

  const planIds: string[] = []
  for (const plan of plans) {
    if (!isPlanAvailableForUser(plan, audience)) continue
    try {
      const discount = await validatePromoCodeForPlan({ prisma, code: promo.code, userId, plan, now })
      const automatic = calculateUserDiscount(plan.priceKopecks, user)
      if (preferUserDiscount(automatic, discount).promoDiscount) planIds.push(plan.id)
    } catch (error) {
      if (!(error instanceof PromoCodeError)) throw error
    }
  }
  if (planIds.length === 0) return { error: 'Промокод больше не даёт скидку на доступные тарифы' }
  return {
    code: promo.code,
    planIds,
    expiresAt: promo.expiresAt,
    discountPercent: promo.discountPercent,
    renewalOnly: promo.purchaseScope === 'RENEWAL_ONLY',
  }
}
