import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { requireAdmin, withAuth } from '@/lib/auth/guard'
import { adminBonusBoxPrizeSchema } from '@/lib/auth/validation'
import { writeAuditLog } from '@/lib/audit-log'
import { isFeatureEnabled } from '@/lib/feature-flags'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = withAuth(async () => {
  if (!isFeatureEnabled('bonusBox')) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  await requireAdmin()
  const prizes = await prisma.bonusBoxPrize.findMany({
    orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }],
  })
  return NextResponse.json({ prizes })
})

export const POST = withAuth(async (req: Request) => {
  if (!isFeatureEnabled('bonusBox')) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  await requireAdmin()

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = adminBonusBoxPrizeSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation error', details: parsed.error.flatten() },
      { status: 400 }
    )
  }

  try {
    const prize = await prisma.bonusBoxPrize.create({
      data: parsed.data,
    })
    await writeAuditLog({
      action: 'ADMIN_BONUS_PRIZE_CREATED',
      message: 'Администратор создал подарок бонусной коробки',
      metadata: {
        entityType: 'bonusBoxPrize',
        prizeId: prize.id,
        type: prize.type,
        value: prize.value,
        rarity: prize.rarity,
        isActive: prize.isActive,
      },
      request: req,
    })
    return NextResponse.json({ prize })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return NextResponse.json({ error: 'Такой подарок уже существует' }, { status: 409 })
    }
    throw error
  }
})
