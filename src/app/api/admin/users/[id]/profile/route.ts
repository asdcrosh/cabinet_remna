import { Prisma } from '@prisma/client'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireAdmin, withAuth } from '@/lib/auth/guard'
import { attachRemnashopIdentityToCabinetUser } from '@/lib/telegram-link-sync'
import { writeAuditLog } from '@/lib/audit-log'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema = z.object({
  email: z.string().trim().toLowerCase().email('Некорректный email').max(255),
  name: z
    .string()
    .trim()
    .transform((value) => value.replace(/\s+/g, ' '))
    .refine((value) => value.length === 0 || value.length >= 2, 'Имя слишком короткое')
    .refine((value) => value.length <= 40, 'Имя слишком длинное')
    .refine(
      (value) => value.length === 0 || /^[\p{L}][\p{L}\s.'-]*[\p{L}]$/u.test(value),
      'В имени допустимы буквы, пробел, дефис, точка и апостроф'
    ),
  emailVerified: z.boolean(),
  telegramId: z.string().trim().regex(/^\d*$/, 'Telegram ID должен содержать только цифры').max(32).optional(),
  telegramUsername: z.string().trim().max(64).optional(),
  remnashopUserId: z.string().trim().regex(/^\d*$/, 'Remnashop ID должен содержать только цифры').max(16).optional(),
  remnawaveUuid: z.string().trim().max(80).optional(),
  remnawaveShortUuid: z.string().trim().max(80).optional(),
  remnawaveUsername: z.string().trim().max(120).optional(),
})

export const PATCH = withAuth(async (req: Request, { params }: { params: { id: string } }) => {
  const session = await requireAdmin()
  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json({
      error: parsed.error.issues[0]?.message || 'Проверьте данные',
      details: parsed.error.flatten(),
    }, { status: 400 })
  }

  const [actor, target] = await Promise.all([
    prisma.user.findUnique({ where: { id: session.uid }, select: { role: true } }),
    prisma.user.findUnique({
      where: { id: params.id },
      select: { id: true, role: true, email: true, telegramId: true },
    }),
  ])

  if (!actor || !target) {
    return NextResponse.json({ error: 'Пользователь не найден' }, { status: 404 })
  }
  if (target.role === 'SUPER_ADMIN' && actor.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Изменять главного администратора нельзя' }, { status: 403 })
  }

  try {
    const emailChanged = target.email !== parsed.data.email
    const user = await prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id: target.id },
        data: {
          email: parsed.data.email,
          name: parsed.data.name || null,
          emailVerifiedAt: parsed.data.emailVerified ? new Date() : null,
          telegramId: parsed.data.telegramId ? BigInt(parsed.data.telegramId) : null,
          telegramUsername: parsed.data.telegramUsername || null,
          remnashopUserId: parsed.data.remnashopUserId ? Number(parsed.data.remnashopUserId) : null,
          remnawaveUuid: parsed.data.remnawaveUuid || null,
          remnawaveShortUuid: parsed.data.remnawaveShortUuid || null,
          remnawaveUsername: parsed.data.remnawaveUsername || null,
        },
        select: {
          id: true,
          email: true,
          name: true,
          emailVerifiedAt: true,
          telegramId: true,
          telegramUsername: true,
          remnashopUserId: true,
          remnawaveUuid: true,
          remnawaveShortUuid: true,
          remnawaveUsername: true,
        },
      })

      if (emailChanged) {
        await Promise.all([
          tx.emailVerificationToken.deleteMany({ where: { userId: target.id } }),
          tx.passwordResetToken.deleteMany({ where: { userId: target.id } }),
        ])
      }

      return updated
    })

    let syncDeferred = false
    if (user.telegramId && user.emailVerifiedAt) {
      try {
        await attachRemnashopIdentityToCabinetUser({
          localUserId: user.id,
          telegramId: user.telegramId,
        })
      } catch (error) {
        syncDeferred = true
        console.error('[admin/users/profile] remnashop sync deferred', {
          userId: user.id,
          message: error instanceof Error ? error.message : String(error),
        })
      }
    }

    await writeAuditLog({
      actorId: session.uid,
      targetId: user.id,
      action: 'ADMIN_PROFILE_UPDATED',
      message: 'Администратор обновил профиль пользователя',
      metadata: {
        emailChanged,
        email: user.email,
        emailVerified: Boolean(user.emailVerifiedAt),
        telegramId: user.telegramId?.toString() ?? null,
        telegramUsername: user.telegramUsername,
        remnashopUserId: user.remnashopUserId,
        remnawaveUuid: user.remnawaveUuid,
        remnawaveShortUuid: user.remnawaveShortUuid,
        remnawaveUsername: user.remnawaveUsername,
        syncDeferred,
      },
      request: req,
    })

    return NextResponse.json({
      user: {
        ...user,
        telegramId: user.telegramId?.toString() ?? null,
        emailVerifiedAt: user.emailVerifiedAt?.toISOString() ?? null,
      },
      syncDeferred,
    })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return NextResponse.json({ error: 'Этот email уже используется другим аккаунтом' }, { status: 409 })
    }
    throw error
  }
})
