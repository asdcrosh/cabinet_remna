import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin, withAuth } from '@/lib/auth/guard'
import { writeAuditLog } from '@/lib/audit-log'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const PATCH = withAuth(async (req: Request) => {
  await requireAdmin()

  let body: { planIds?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const planIds = Array.isArray(body.planIds)
    ? body.planIds.filter((id): id is string => typeof id === 'string').map((id) => id.trim()).filter(Boolean)
    : []

  if (!planIds.length || planIds.length > 1000 || new Set(planIds).size !== planIds.length) {
    return NextResponse.json({ error: 'Передайте полный список уникальных идентификаторов тарифов' }, { status: 400 })
  }

  const reordered = await prisma.$transaction(async (tx) => {
    const storedPlans = await tx.plan.findMany({ select: { id: true } })
    const storedIds = new Set(storedPlans.map((plan) => plan.id))
    const containsEveryPlan = planIds.length === storedIds.size && planIds.every((id) => storedIds.has(id))
    if (!containsEveryPlan) return false

    await Promise.all(
      planIds.map((id, index) => tx.plan.update({
        where: { id },
        data: { sortOrder: (index + 1) * 10 },
      }))
    )
    return true
  })

  if (!reordered) {
    return NextResponse.json(
      { error: 'Список тарифов изменился. Обновите страницу и повторите перемещение.' },
      { status: 409 }
    )
  }

  await writeAuditLog({
    action: 'ADMIN_PLAN_UPDATED',
    message: 'Администратор изменил порядок тарифов',
    metadata: {
      entityType: 'plan-catalog',
      planIds,
    },
    request: req,
  })

  return NextResponse.json({ ok: true })
})
