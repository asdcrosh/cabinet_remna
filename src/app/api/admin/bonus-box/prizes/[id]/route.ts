import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { requireAdmin, withAuth } from '@/lib/auth/guard'
import { updateAdminBonusBoxPrizeSchema } from '@/lib/auth/validation'
import { writeAuditLog } from '@/lib/audit-log'
import { isFeatureEnabled } from '@/lib/feature-flags'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const PATCH = withAuth(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  if (!await isFeatureEnabled('bonusBox')) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  await requireAdmin()
  const { id } = await params

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = updateAdminBonusBoxPrizeSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation error', details: parsed.error.flatten() },
      { status: 400 }
    )
  }

  const existing = await prisma.bonusBoxPrize.findUnique({
    where: { id },
    select: { type: true, value: true, rarity: true },
  })
  if (!existing) {
    return NextResponse.json({ error: 'Подарок не найден' }, { status: 404 })
  }

  const effectiveType = parsed.data.type ?? existing.type
  const effectiveValue = parsed.data.value ?? existing.value
  const effectiveRarity = parsed.data.rarity ?? existing.rarity
  if (effectiveType !== 'NO_PRIZE' && effectiveValue < 1) {
    return NextResponse.json({ error: 'Значение подарка должно быть больше 0' }, { status: 400 })
  }
  if (effectiveType === 'NO_PRIZE' && effectiveValue !== 0) {
    return NextResponse.json({ error: 'Для исхода без подарка значение должно быть 0' }, { status: 400 })
  }
  if (effectiveType === 'NO_PRIZE' && effectiveRarity !== 'COMMON') {
    return NextResponse.json({ error: 'Исход без подарка должен быть базовым' }, { status: 400 })
  }
  if (effectiveType === 'PROMO_CODE_PERCENT' && effectiveValue > 99) {
    return NextResponse.json({ error: 'Скидка должна быть от 1% до 99%' }, { status: 400 })
  }
  if (effectiveType === 'BONUS_ATTEMPTS' && effectiveValue > 100) {
    return NextResponse.json({ error: 'Количество открытий должно быть от 1 до 100' }, { status: 400 })
  }

  try {
    const prize = await prisma.bonusBoxPrize.update({
      where: { id },
      data: parsed.data,
    })
    await writeAuditLog({
      action: 'ADMIN_BONUS_PRIZE_UPDATED',
      message: 'Администратор обновил подарок бонусной коробки',
      metadata: {
        entityType: 'bonusBoxPrize',
        prizeId: prize.id,
        changedFields: Object.keys(parsed.data),
      },
      request: req,
    })

    return NextResponse.json({ prize })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      return NextResponse.json({ error: 'Подарок не найден' }, { status: 404 })
    }
    throw error
  }
})
