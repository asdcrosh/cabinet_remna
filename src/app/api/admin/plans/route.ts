import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { requireAdmin, withAuth } from '@/lib/auth/guard'
import { adminPlanSchema } from '@/lib/auth/validation'
import { writeAuditLog } from '@/lib/audit-log'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = withAuth(async () => {
  await requireAdmin()

  const plans = await prisma.plan.findMany({
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
  })

  return NextResponse.json({ plans })
})

export const POST = withAuth(async (req: Request) => {
  await requireAdmin()

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = adminPlanSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation error', details: parsed.error.flatten() },
      { status: 400 }
    )
  }

  const normalized = normalizePlanInput(parsed.data)
  const data = {
    ...normalized,
    featuredSlot: normalized.isFeatured ? 1 : null,
  }
  let plan: Awaited<ReturnType<typeof prisma.plan.create>>
  try {
    plan = await prisma.$transaction(async (tx) => {
      if (data.isFeatured) {
        await tx.plan.updateMany({
          where: { isFeatured: true },
          data: { isFeatured: false, featuredSlot: null },
        })
      }
      return tx.plan.create({ data })
    })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return NextResponse.json({ error: 'Популярный тариф уже изменён другим администратором' }, { status: 409 })
    }
    throw error
  }
  await writeAuditLog({
    action: 'ADMIN_PLAN_CREATED',
    message: 'Администратор создал тариф',
    metadata: {
      entityType: 'plan',
      planId: plan.id,
      name: plan.name,
      priceKopecks: plan.priceKopecks,
      durationDays: plan.durationDays,
      isActive: plan.isActive,
      isFeatured: plan.isFeatured,
    },
    request: req,
  })

  return NextResponse.json({ plan }, { status: 201 })
})

function normalizePlanInput<T extends { description?: string | null }>(data: T) {
  return {
    ...data,
    description: data.description?.trim() || null,
    allowedEmails: 'allowedEmails' in data && Array.isArray(data.allowedEmails)
      ? Array.from(new Set(data.allowedEmails.map((email) => email.trim().toLowerCase())))
      : undefined,
    allowedTelegramIds: 'allowedTelegramIds' in data && Array.isArray(data.allowedTelegramIds)
      ? Array.from(new Set(data.allowedTelegramIds))
      : undefined,
  }
}
