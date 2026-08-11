import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireAdmin, withAuth } from '@/lib/auth/guard'
import { ensureRemnawaveSubscription } from '@/lib/subscription'
import { writeAuditLog } from '@/lib/audit-log'
import { logError } from '@/lib/logger'
import { RemnawaveError } from '@/lib/remnawave'
import { terminateUserSubscription } from '@/lib/subscription-termination'
import { buildServerErrorDiagnostics } from '@/lib/error-diagnostics'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema = z.object({
  planId: z.string().min(1),
  mode: z.enum(['REPLACE', 'EXTEND']).default('REPLACE'),
})

export const POST = withAuth(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const session = await requireAdmin()
  const { id } = await params
  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Выберите тариф и способ начисления' }, { status: 400 })
  }

  const [actor, user, plan] = await Promise.all([
    prisma.user.findUnique({ where: { id: session.uid }, select: { role: true } }),
    prisma.user.findUnique({
      where: { id },
      select: { id: true, email: true, role: true },
    }),
    prisma.plan.findUnique({ where: { id: parsed.data.planId } }),
  ])

  if (!actor || !user) {
    return NextResponse.json({ error: 'Пользователь не найден' }, { status: 404 })
  }
  if (!plan) {
    return NextResponse.json({ error: 'Тариф не найден' }, { status: 404 })
  }
  if (user.role === 'SUPER_ADMIN' && actor.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Изменять главного администратора нельзя' }, { status: 403 })
  }

  const result = await ensureRemnawaveSubscription({
    userId: user.id,
    email: user.email,
    periodMode: parsed.data.mode,
    plan: {
      id: plan.id,
      name: plan.name,
      durationDays: plan.durationDays,
      trafficLimitGb: plan.trafficLimitGb,
      deviceLimit: plan.deviceLimit,
      activeInternalSquads: plan.activeInternalSquads,
    },
  })

  await writeAuditLog({
    actorId: session.uid,
    targetId: user.id,
    action: 'ADMIN_PLAN_ASSIGNED',
    message: parsed.data.mode === 'REPLACE' ? 'Администратор назначил тариф' : 'Администратор продлил тариф',
    metadata: {
      planId: plan.id,
      planName: plan.name,
      mode: parsed.data.mode,
      subscriptionId: result.subscription.id,
      expireAt: result.subscription.expireAt.toISOString(),
    },
    request: req,
  })

  return NextResponse.json({
    subscription: {
      id: result.subscription.id,
      planId: result.subscription.planId,
      expireAt: result.subscription.expireAt.toISOString(),
      status: result.subscription.status,
    },
  })
})

export const DELETE = withAuth(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const session = await requireAdmin()
  const { id } = await params
  const [actor, user] = await Promise.all([
    prisma.user.findUnique({ where: { id: session.uid }, select: { role: true } }),
    prisma.user.findUnique({
      where: { id },
      select: { id: true, email: true, role: true, remnawaveId: true, remnawaveUuid: true },
    }),
  ])
  if (!actor || !user) {
    return NextResponse.json({ error: 'Пользователь не найден' }, { status: 404 })
  }
  if (user.role === 'SUPER_ADMIN' && actor.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Изменять главного администратора нельзя' }, { status: 403 })
  }

  try {
    const result = await terminateUserSubscription({
      userId: user.id,
      source: 'ADMIN_REQUEST',
    })
    if (!result.hadSubscription) {
      return NextResponse.json({ error: 'Активная подписка не найдена' }, { status: 404 })
    }
  } catch (error) {
    if (error instanceof RemnawaveError) {
      logError('admin.subscription_disable_failed', error, {
        userId: user.id,
        remnawaveId: user.remnawaveId,
        remnawaveUuid: user.remnawaveUuid,
        status: error.status,
      })
      return NextResponse.json(
        {
          error: 'Не удалось отключить подписку в Remnawave. Повторите позже.',
          details: buildServerErrorDiagnostics(error),
        },
        { status: 502 }
      )
    }
    throw error
  }

  await writeAuditLog({
    actorId: session.uid,
    targetId: user.id,
    action: 'ADMIN_SUBSCRIPTION_DISABLED',
    message: 'Администратор отключил подписку пользователя',
    metadata: {
      email: user.email,
      remnawaveId: user.remnawaveId,
      remnawaveUuid: user.remnawaveUuid,
    },
    request: req,
  })

  return NextResponse.json({ ok: true })
})
