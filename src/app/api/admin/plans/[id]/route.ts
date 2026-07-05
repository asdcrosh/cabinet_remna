import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { requireAdmin, withAuth } from '@/lib/auth/guard'
import { updateAdminPlanSchema } from '@/lib/auth/validation'
import { writeAuditLog } from '@/lib/audit-log'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const PATCH = withAuth(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  await requireAdmin()
  const { id } = await params

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
      where: { id },
      data,
    })
    await writeAuditLog({
      action: 'ADMIN_PROFILE_UPDATED',
      targetId: plan.id,
      message: 'Администратор обновил тариф',
      metadata: {
        entityType: 'plan',
        planId: plan.id,
        name: plan.name,
        changedFields: Object.keys(data),
      },
      request: req,
    })

    return NextResponse.json({ plan })
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
      return NextResponse.json({ error: 'Тариф не найден' }, { status: 404 })
    }
    throw e
  }
})

export const DELETE = withAuth(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  await requireAdmin()
  const { id } = await params

  const plan = await prisma.plan.findUnique({
    where: { id },
    include: {
      _count: {
        select: {
          payments: true,
          subscriptions: true,
          trialRedemptions: true,
        },
      },
    },
  })

  if (!plan) {
    return NextResponse.json({ error: 'Тариф не найден' }, { status: 404 })
  }

  const linkedCount = plan._count.payments + plan._count.subscriptions + plan._count.trialRedemptions
  if (linkedCount > 0) {
    return NextResponse.json(
      { error: 'Нельзя удалить тариф с платежами или подписками. Скрывайте его вместо удаления.' },
      { status: 409 }
    )
  }

  try {
    await prisma.plan.delete({ where: { id } })
    await writeAuditLog({
      action: 'ADMIN_PROFILE_UPDATED',
      targetId: plan.id,
      message: 'Администратор удалил тариф',
      metadata: {
        entityType: 'plan',
        planId: plan.id,
        name: plan.name,
        priceKopecks: plan.priceKopecks,
        durationDays: plan.durationDays,
      },
      request: req,
    })
    return NextResponse.json({ ok: true })
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
      return NextResponse.json({ error: 'Тариф не найден' }, { status: 404 })
    }
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2003') {
      return NextResponse.json(
        { error: 'Нельзя удалить тариф, который используется в данных кабинета.' },
        { status: 409 }
      )
    }
    throw e
  }
})

function normalizePlanInput<T extends { description?: string | null }>(data: T) {
  return {
    ...data,
    description: data.description === undefined ? undefined : data.description?.trim() || null,
    allowedEmails: 'allowedEmails' in data && Array.isArray(data.allowedEmails)
      ? Array.from(new Set(data.allowedEmails.map((email) => email.trim().toLowerCase())))
      : undefined,
    allowedTelegramIds: 'allowedTelegramIds' in data && Array.isArray(data.allowedTelegramIds)
      ? Array.from(new Set(data.allowedTelegramIds))
      : undefined,
  }
}
