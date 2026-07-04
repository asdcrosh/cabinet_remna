import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { requireAdmin, withAuth } from '@/lib/auth/guard'
import { adminPromoCodeSchema } from '@/lib/auth/validation'
import { normalizePromoCode } from '@/lib/promo-codes'
import { writeAuditLog } from '@/lib/audit-log'
import { cleanupExpiredBonusBoxPromoCodes } from '@/lib/promo-code-cleanup'
import {
  deactivateCabinetPromoCodesInRemnashopBestEffort,
  syncCabinetPromoCodeToRemnashopBestEffort,
} from '@/lib/remnashop-promo-sync'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = withAuth(async () => {
  await requireAdmin()
  await cleanupExpiredBonusBoxPromoCodes()

  const promoCodes = await prisma.promoCode.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      plans: { include: { plan: true } },
      redemptions: { select: { status: true } },
    },
  })

  return NextResponse.json({ promoCodes })
})

export const DELETE = withAuth(async (req: Request) => {
  const session = await requireAdmin()

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const ids = Array.isArray((body as { ids?: unknown })?.ids)
    ? (body as { ids: unknown[] }).ids.filter((id): id is string => typeof id === 'string' && id.length > 0)
    : []
  const uniqueIds = Array.from(new Set(ids)).slice(0, 100)
  if (uniqueIds.length === 0) {
    return NextResponse.json({ error: 'Выберите промокоды' }, { status: 400 })
  }

  const promoCodes = await prisma.promoCode.findMany({
    where: { id: { in: uniqueIds } },
    select: { id: true, code: true },
  })
  if (promoCodes.length === 0) {
    return NextResponse.json({ error: 'Промокоды не найдены' }, { status: 404 })
  }

  await deactivateCabinetPromoCodesInRemnashopBestEffort(promoCodes.map((promoCode) => promoCode.code))
  const deleted = await prisma.promoCode.deleteMany({
    where: { id: { in: promoCodes.map((promoCode) => promoCode.id) } },
  })

  await writeAuditLog({
    actorId: session.uid,
    action: 'PROMO_CODE_UPDATED',
    message: 'Администратор удалил выбранные промокоды',
    metadata: {
      count: deleted.count,
      promoCodes,
    },
    request: req,
  })

  return NextResponse.json({ ok: true, deleted: deleted.count })
})

export const PATCH = withAuth(async (req: Request) => {
  const session = await requireAdmin()

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const ids = Array.isArray((body as { ids?: unknown })?.ids)
    ? (body as { ids: unknown[] }).ids.filter((id): id is string => typeof id === 'string' && id.length > 0)
    : []
  const uniqueIds = Array.from(new Set(ids)).slice(0, 100)
  const isActive = (body as { isActive?: unknown })?.isActive
  if (uniqueIds.length === 0) {
    return NextResponse.json({ error: 'Выберите промокоды' }, { status: 400 })
  }
  if (typeof isActive !== 'boolean') {
    return NextResponse.json({ error: 'isActive is required' }, { status: 400 })
  }

  const promoCodes = await prisma.promoCode.findMany({
    where: { id: { in: uniqueIds } },
    select: { id: true, code: true },
  })
  if (promoCodes.length === 0) {
    return NextResponse.json({ error: 'Промокоды не найдены' }, { status: 404 })
  }

  const updated = await prisma.promoCode.updateMany({
    where: { id: { in: promoCodes.map((promoCode) => promoCode.id) } },
    data: { isActive },
  })

  for (const promoCode of promoCodes) {
    await syncCabinetPromoCodeToRemnashopBestEffort(promoCode.id)
  }

  await writeAuditLog({
    actorId: session.uid,
    action: 'PROMO_CODE_UPDATED',
    message: isActive ? 'Администратор включил выбранные промокоды' : 'Администратор отключил выбранные промокоды',
    metadata: {
      count: updated.count,
      promoCodes,
      isActive,
    },
    request: req,
  })

  return NextResponse.json({ ok: true, updated: updated.count })
})

export const POST = withAuth(async (req: Request) => {
  const session = await requireAdmin()

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = adminPromoCodeSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation error', details: parsed.error.flatten() },
      { status: 400 }
    )
  }

  const data = parsed.data
  const code = normalizePromoCode(data.code)
  if (!code) return NextResponse.json({ error: 'Введите промокод' }, { status: 400 })
  const allowedEmails = data.audience === 'PERSONAL' ? normalizeAllowedEmails(data.allowedEmails) : []

  try {
    const promoCode = await prisma.promoCode.create({
      data: {
        code,
        discountPercent: data.discountPercent,
        audience: data.audience,
        allowedEmails,
        isActive: data.isActive,
        startsAt: data.startsAt ? new Date(data.startsAt) : null,
        expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
        maxUses: data.maxUses ?? null,
        maxUsesPerUser: data.maxUsesPerUser,
        plans: {
          create: data.planIds.map((planId) => ({ planId })),
        },
      },
    })

    await writeAuditLog({
      actorId: session.uid,
      action: 'PROMO_CODE_CREATED',
      message: 'Администратор создал промокод',
      metadata: {
        promoCodeId: promoCode.id,
        code: promoCode.code,
        discountPercent: promoCode.discountPercent,
        audience: promoCode.audience,
        allowedEmails,
        planIds: data.planIds,
      },
      request: req,
    })
    await syncCabinetPromoCodeToRemnashopBestEffort(promoCode.id)

    return NextResponse.json({ promoCode })
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return NextResponse.json({ error: 'Промокод с таким кодом уже существует' }, { status: 409 })
    }
    throw e
  }
})

function normalizeAllowedEmails(emails: string[]) {
  return Array.from(new Set(emails.map((email) => email.trim().toLowerCase()).filter(Boolean)))
}
