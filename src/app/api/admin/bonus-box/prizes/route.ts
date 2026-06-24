import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { requireAdmin, withAuth } from '@/lib/auth/guard'
import { adminBonusBoxPrizeSchema } from '@/lib/auth/validation'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = withAuth(async () => {
  await requireAdmin()
  const prizes = await prisma.bonusBoxPrize.findMany({
    orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }],
  })
  return NextResponse.json({ prizes })
})

export const POST = withAuth(async (req: Request) => {
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
    return NextResponse.json({ prize })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return NextResponse.json({ error: 'Такой подарок уже существует' }, { status: 409 })
    }
    throw error
  }
})
