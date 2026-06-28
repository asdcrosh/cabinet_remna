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
  code: z.string().trim().min(3).max(32).regex(/^[A-Za-z0-9_-]+$/).optional(),
  planId: z.string().min(1).max(64).optional(),
  durationDays: z.coerce.number().int().min(1).max(365).optional(),
  maxUses: z.coerce.number().int().min(1).max(100_000).optional(),
  maxUsesPerUser: z.coerce.number().int().min(1).max(100).optional(),
  isActive: z.boolean().optional(),
  startsAt: z.string().datetime().optional().nullable(),
  expiresAt: z.string().datetime().optional().nullable(),
}).refine((value) => !value.startsAt || !value.expiresAt || new Date(value.startsAt) < new Date(value.expiresAt), {
  path: ['expiresAt'],
  message: 'Дата окончания должна быть позже даты начала',
})

export const PATCH = withAuth(async (req: Request, { params }: { params: { id: string } }) => {
  const session = await requireAdmin()
  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Проверьте данные сертификата' }, { status: 400 })
  }

  const data = parsed.data
  const normalizedCode = data.code === undefined ? undefined : normalizePromoCode(data.code)
  if (data.code !== undefined && !normalizedCode) {
    return NextResponse.json({ error: 'Введите код сертификата' }, { status: 400 })
  }

  try {
    const certificate = await prisma.giftCertificate.update({
      where: { id: params.id },
      data: {
        ...(normalizedCode ? { code: normalizedCode } : {}),
        ...(data.planId ? { planId: data.planId } : {}),
        ...(data.durationDays !== undefined ? { durationDays: data.durationDays } : {}),
        ...(data.maxUses !== undefined ? { maxUses: data.maxUses } : {}),
        ...(data.maxUsesPerUser !== undefined ? { maxUsesPerUser: data.maxUsesPerUser } : {}),
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
        ...(data.startsAt !== undefined ? { startsAt: data.startsAt ? new Date(data.startsAt) : null } : {}),
        ...(data.expiresAt !== undefined ? { expiresAt: data.expiresAt ? new Date(data.expiresAt) : null } : {}),
      },
    })

    await writeAuditLog({
      actorId: session.uid,
      action: 'GIFT_CERTIFICATE_UPDATED',
      message: 'Администратор обновил подарочный сертификат',
      metadata: {
        certificateId: certificate.id,
        code: certificate.code,
        isActive: certificate.isActive,
      },
      request: req,
    })

    return NextResponse.json({ certificate })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        return NextResponse.json({ error: 'Сертификат с таким кодом уже существует' }, { status: 409 })
      }
      if (error.code === 'P2025') {
        return NextResponse.json({ error: 'Сертификат не найден' }, { status: 404 })
      }
    }
    throw error
  }
})
