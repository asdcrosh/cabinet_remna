import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, withAuth } from '@/lib/auth/guard'
import { validatePromoCodeSchema } from '@/lib/auth/validation'
import { PromoCodeError, validatePromoCodeForPlan } from '@/lib/promo-codes'
import { rateLimit } from '@/lib/rate-limit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const POST = withAuth(async (req: Request) => {
  const session = await requireAuth()
  const limited = await rateLimit(req, `promo-validate:${session.uid}`, 30, 60_000)
  if (!limited.ok) {
    return NextResponse.json(
      { error: 'Слишком много проверок промокода. Попробуйте позже.' },
      { status: 429, headers: { 'Retry-After': String(limited.retryAfter) } }
    )
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = validatePromoCodeSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation error', details: parsed.error.flatten() },
      { status: 400 }
    )
  }

  const plan = await prisma.plan.findUnique({ where: { id: parsed.data.planId } })
  if (!plan || !plan.isActive) {
    return NextResponse.json({ error: 'Тариф не найден' }, { status: 404 })
  }

  try {
    const discount = await validatePromoCodeForPlan({
      prisma,
      code: parsed.data.promoCode,
      userId: session.uid,
      plan,
    })

    return NextResponse.json({
      code: discount.normalizedCode,
      discountPercent: discount.discountPercent,
      discountKopecks: discount.discountKopecks,
      originalAmountKopecks: discount.originalAmountKopecks,
      finalAmountKopecks: discount.finalAmountKopecks,
    })
  } catch (e) {
    if (e instanceof PromoCodeError) {
      return NextResponse.json({ error: e.message, code: e.code }, { status: e.status })
    }
    throw e
  }
})
