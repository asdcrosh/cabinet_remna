import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { requireAdmin, withAuth } from '@/lib/auth/guard'
import { prisma } from '@/lib/prisma'
import { normalizePromoCode } from '@/lib/promo-codes'
import { writeAuditLog } from '@/lib/audit-log'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema = z.object({
  code: z.string().trim().min(3).max(32).regex(/^[A-Za-z0-9_-]+$/),
  planId: z.string().min(1).max(64),
  durationDays: z.coerce.number().int().min(1).max(365),
  maxUses: z.coerce.number().int().min(1).max(100_000).default(1),
  maxUsesPerUser: z.coerce.number().int().min(1).max(100).default(1),
  isActive: z.boolean().default(true),
  startsAt: z.string().datetime().optional().nullable(),
  expiresAt: z.string().datetime().optional().nullable(),
}).refine((value) => !value.startsAt || !value.expiresAt || new Date(value.startsAt) < new Date(value.expiresAt), {
  path: ['expiresAt'],
  message: 'Дата окончания должна быть позже даты начала',
})

export const POST = withAuth(async (req: Request) => {
  const session = await requireAdmin()
  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Проверьте код, тариф, срок и лимиты' }, { status: 400 })
  }

  const data = parsed.data
  const code = normalizePromoCode(data.code)
  if (!code) return NextResponse.json({ error: 'Введите код сертификата' }, { status: 400 })

  const plan = await prisma.plan.findUnique({ where: { id: data.planId }, select: { id: true } })
  if (!plan) return NextResponse.json({ error: 'Тариф не найден' }, { status: 404 })

  try {
    const certificate = await prisma.giftCertificate.create({
      data: {
        code,
        planId: data.planId,
        durationDays: data.durationDays,
        maxUses: data.maxUses,
        maxUsesPerUser: data.maxUsesPerUser,
        isActive: data.isActive,
        startsAt: data.startsAt ? new Date(data.startsAt) : null,
        expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
      },
    })

    await writeAuditLog({
      actorId: session.uid,
      action: 'GIFT_CERTIFICATE_CREATED',
      message: 'Администратор создал подарочный сертификат',
      metadata: {
        certificateId: certificate.id,
        code: certificate.code,
        planId: certificate.planId,
        durationDays: certificate.durationDays,
      },
      request: req,
    })

    return NextResponse.json({ certificate })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return NextResponse.json({ error: 'Сертификат с таким кодом уже существует' }, { status: 409 })
    }
    throw error
  }
})
