import { NextResponse } from 'next/server'
import { z } from 'zod'
import { BonusBoxError, grantManualBonusBoxAttemptsBulk } from '@/lib/bonus-box'
import { requireSuperAdmin, withAuth } from '@/lib/auth/guard'
import { prisma } from '@/lib/prisma'
import { isFeatureEnabled } from '@/lib/feature-flags'
import { notifyBonusGrantedInAppBulk } from '@/lib/notifications'
import { writeAuditLog } from '@/lib/audit-log'
import { logError } from '@/lib/logger'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const searchSchema = z.object({
  q: z.string().trim().max(100).default(''),
})

const grantSchema = z.object({
  audience: z.enum(['ALL', 'SELECTED']),
  userIds: z.array(z.string().min(1).max(64)).max(200).default([]),
  attemptsCount: z.coerce.number().int().min(1).max(100),
  operationId: z.string().uuid(),
}).superRefine((value, context) => {
  if (value.audience === 'SELECTED' && value.userIds.length === 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['userIds'],
      message: 'Выберите хотя бы одного пользователя',
    })
  }
})

export const GET = withAuth(async (req: Request) => {
  if (!await isFeatureEnabled('bonusBox')) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  await requireSuperAdmin()

  const url = new URL(req.url)
  const parsed = searchSchema.safeParse({
    q: url.searchParams.get('q') ?? '',
  })
  if (!parsed.success) {
    return NextResponse.json({ error: 'Слишком длинный поисковый запрос' }, { status: 400 })
  }

  const q = parsed.data.q
  const users = await prisma.user.findMany({
    where: {
      role: 'USER',
      ...(q
        ? {
            OR: [
              { email: { contains: q, mode: 'insensitive' as const } },
              { name: { contains: q, mode: 'insensitive' as const } },
              { telegramUsername: { contains: q, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    },
    orderBy: [{ lastLoginAt: 'desc' }, { createdAt: 'desc' }],
    take: 20,
    select: {
      id: true,
      email: true,
      name: true,
      telegramUsername: true,
      lastLoginAt: true,
    },
  })

  return NextResponse.json({
    users: users.map((user) => ({
      ...user,
      lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    })),
  })
})

export const POST = withAuth(async (req: Request) => {
  if (!await isFeatureEnabled('bonusBox')) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  const session = await requireSuperAdmin()

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = grantSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({
      error: parsed.error.issues[0]?.message ?? 'Проверьте параметры начисления',
    }, { status: 400 })
  }

  try {
    const result = await grantManualBonusBoxAttemptsBulk({
      audience: parsed.data.audience,
      userIds: parsed.data.audience === 'SELECTED' ? parsed.data.userIds : undefined,
      adminId: session.uid,
      attemptsCount: parsed.data.attemptsCount,
      operationId: parsed.data.operationId,
    })

    if (result.grantedUserIds.length > 0) {
      await notifyBonusGrantedInAppBulk({
        userIds: result.grantedUserIds,
        attemptsCount: result.attemptsPerUser,
        operationId: parsed.data.operationId,
      }).catch((error) => {
        logError('bonus_box.bulk_grant_notification_failed', error, {
          operationId: parsed.data.operationId,
          recipients: result.grantedUserIds.length,
        })
      })
      await writeAuditLog({
        actorId: session.uid,
        action: 'ADMIN_BONUS_ATTEMPTS_GRANTED',
        message: `Массово начислены открытия подарочного бокса: ${result.attemptsGranted}`,
        metadata: {
          audience: parsed.data.audience,
          recipients: result.recipientsGranted,
          attemptsPerUser: result.attemptsPerUser,
          attemptsGranted: result.attemptsGranted,
          operationId: parsed.data.operationId,
          ...(parsed.data.audience === 'SELECTED'
            ? { selectedUserIds: result.grantedUserIds.slice(0, 200) }
            : {}),
        },
        request: req,
      })
    }

    return NextResponse.json({
      recipientsCount: result.recipientsCount,
      recipientsGranted: result.recipientsGranted,
      attemptsGranted: result.attemptsGranted,
      attemptsPerUser: result.attemptsPerUser,
      alreadyProcessed: result.alreadyProcessed,
    })
  } catch (error) {
    if (error instanceof BonusBoxError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
    }
    throw error
  }
})
