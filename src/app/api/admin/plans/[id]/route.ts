import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { requireAdmin, withAuth } from '@/lib/auth/guard'
import { updateAdminPlanSchema } from '@/lib/auth/validation'

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

  const parsed = updateAdminPlanSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation error', details: parsed.error.flatten() },
      { status: 400 }
    )
  }

  const data = normalizePlanInput(parsed.data)

  try {
    const plan = await prisma.plan.update({
      where: { id: params.id },
      data,
    })

    return NextResponse.json({ plan })
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
      return NextResponse.json({ error: 'Тариф не найден' }, { status: 404 })
    }
    throw e
  }
})

function normalizePlanInput<T extends { description?: string | null }>(data: T) {
  return {
    ...data,
    description: data.description === undefined ? undefined : data.description?.trim() || null,
  }
}
