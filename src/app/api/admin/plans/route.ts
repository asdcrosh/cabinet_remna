import { NextResponse } from 'next/server'
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

  const data = normalizePlanInput(parsed.data)
  const plan = await prisma.plan.create({ data })
  await writeAuditLog({
    action: 'ADMIN_PROFILE_UPDATED',
    targetId: plan.id,
    message: 'Администратор создал тариф',
    metadata: {
      entityType: 'plan',
      planId: plan.id,
      name: plan.name,
      priceKopecks: plan.priceKopecks,
      durationDays: plan.durationDays,
      isActive: plan.isActive,
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
