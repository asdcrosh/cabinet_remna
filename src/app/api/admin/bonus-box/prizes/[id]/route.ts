import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { requireAdmin, withAuth } from '@/lib/auth/guard'
import { updateAdminBonusBoxPrizeSchema } from '@/lib/auth/validation'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const PATCH = withAuth(async (req: Request, { params }: { params: { id: string } }) => {
  await requireAdmin()

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
    where: { id: params.id },
    select: { type: true, value: true },
  })
  if (!existing) {
    return NextResponse.json({ error: 'Подарок не найден' }, { status: 404 })
  }

  const effectiveType = parsed.data.type ?? existing.type
  const effectiveValue = parsed.data.value ?? existing.value
  if (effectiveType === 'PROMO_CODE_PERCENT' && effectiveValue > 99) {
    return NextResponse.json({ error: 'Скидка должна быть от 1% до 99%' }, { status: 400 })
  }
  if (effectiveType === 'BONUS_ATTEMPTS' && effectiveValue > 100) {
    return NextResponse.json({ error: 'Количество открытий должно быть от 1 до 100' }, { status: 400 })
  }

  try {
    const prize = await prisma.bonusBoxPrize.update({
      where: { id: params.id },
      data: parsed.data,
    })

    return NextResponse.json({ prize })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      return NextResponse.json({ error: 'Подарок не найден' }, { status: 404 })
    }
    throw error
  }
})
