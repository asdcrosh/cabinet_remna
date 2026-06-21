import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { requireAdmin, withAuth } from '@/lib/auth/guard'
import { adminPromoCodeSchema } from '@/lib/auth/validation'
import { normalizePromoCode } from '@/lib/promo-codes'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = withAuth(async () => {
  await requireAdmin()

  const promoCodes = await prisma.promoCode.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      plans: { include: { plan: true } },
      redemptions: { select: { status: true } },
    },
  })

  return NextResponse.json({ promoCodes })
})

export const POST = withAuth(async (req: Request) => {
  await requireAdmin()

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = adminPromoCodeSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation error', details: parsed.error.flatten() },
      { status: 400 }
    )
  }

  const data = parsed.data
  const code = normalizePromoCode(data.code)
  if (!code) return NextResponse.json({ error: 'Введите промокод' }, { status: 400 })

  try {
    const promoCode = await prisma.promoCode.create({
      data: {
        code,
        discountPercent: data.discountPercent,
        isActive: data.isActive,
        startsAt: data.startsAt ? new Date(data.startsAt) : null,
        expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
        maxUses: data.maxUses ?? null,
        maxUsesPerUser: data.maxUsesPerUser,
        plans: {
          create: data.planIds.map((planId) => ({ planId })),
        },
      },
    })

    return NextResponse.json({ promoCode })
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return NextResponse.json({ error: 'Промокод с таким кодом уже существует' }, { status: 409 })
    }
    throw e
  }
})
