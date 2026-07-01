import { prisma } from '@/lib/prisma'

export async function cleanupExpiredBonusBoxPromoCodes(now = new Date()) {
  if (!prisma.promoCode?.deleteMany) return { count: 0 }

  return prisma.promoCode.deleteMany({
    where: {
      code: { startsWith: 'BOX-' },
      expiresAt: { lt: now },
      bonusBoxOpenings: { some: {} },
      redemptions: { none: {} },
      payments: { none: {} },
    },
  })
}
