import { logError } from './logger'
import { prisma } from './prisma'

export type CalculatedUserDiscount = {
  source: 'PERSONAL' | 'NEXT_PURCHASE'
  discountPercent: number
  discountKopecks: number
  finalAmountKopecks: number
}

export function calculateUserDiscount(
  amountKopecks: number,
  discounts: {
    personalDiscountPercent: number
    nextPurchaseDiscountPercent?: number
  }
): CalculatedUserDiscount | null {
  const personal = normalizeDiscountPercent(discounts.personalDiscountPercent)
  const nextPurchase = normalizeDiscountPercent(discounts.nextPurchaseDiscountPercent ?? 0)
  const source = nextPurchase > personal ? 'NEXT_PURCHASE' : 'PERSONAL'
  const discountPercent = Math.max(personal, nextPurchase)

  if (discountPercent === 0 || amountKopecks <= 100) return null

  const rawDiscount = Math.floor((amountKopecks * discountPercent) / 100)
  const discountKopecks = Math.min(rawDiscount, amountKopecks - 100)

  return {
    source,
    discountPercent,
    discountKopecks,
    finalAmountKopecks: amountKopecks - discountKopecks,
  }
}

export function calculatePersonalDiscount(amountKopecks: number, personalDiscountPercent: number) {
  return calculateUserDiscount(amountKopecks, { personalDiscountPercent })
}

export function preferUserDiscount<T extends { discountPercent: number; discountKopecks: number }>(
  userDiscount: CalculatedUserDiscount | null,
  promoDiscount: T | null
) {
  if (!userDiscount) return { userDiscount: null, promoDiscount }
  if (!promoDiscount) return { userDiscount, promoDiscount: null }

  if (promoDiscount.discountKopecks > userDiscount.discountKopecks) {
    return { userDiscount: null, promoDiscount }
  }

  if (
    promoDiscount.discountKopecks === userDiscount.discountKopecks
    && userDiscount.source === 'NEXT_PURCHASE'
  ) {
    return { userDiscount: null, promoDiscount }
  }

  return { userDiscount, promoDiscount: null }
}

function normalizeDiscountPercent(value: number) {
  if (!Number.isInteger(value) || value < 0 || value > 99) return 0
  return value
}

export async function restoreNextPurchaseDiscount(paymentId: string) {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    select: {
      userId: true,
      userDiscountType: true,
      discountPercent: true,
    },
  })
  if (payment?.userDiscountType !== 'NEXT_PURCHASE' || !payment.discountPercent) return false

  const restored = await prisma.user.updateMany({
    where: {
      id: payment.userId,
      nextPurchaseDiscountPercent: 0,
    },
    data: { nextPurchaseDiscountPercent: payment.discountPercent },
  })
  return restored.count > 0
}

export async function restoreNextPurchaseDiscountBestEffort(paymentId: string) {
  try {
    return await restoreNextPurchaseDiscount(paymentId)
  } catch (error) {
    logError('payment.next_purchase_discount_restore_failed', error, { paymentId })
    return false
  }
}
