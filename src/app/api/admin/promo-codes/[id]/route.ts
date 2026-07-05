import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { requireAdmin, withAuth } from '@/lib/auth/guard'
import { updateAdminPromoCodeSchema } from '@/lib/auth/validation'
import { normalizePromoCode } from '@/lib/promo-codes'
import { writeAuditLog } from '@/lib/audit-log'
import {
  deactivateCabinetPromoCodesInRemnashopBestEffort,
  syncCabinetPromoCodeToRemnashopBestEffort,
} from '@/lib/remnashop-promo-sync'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const PATCH = withAuth(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const session = await requireAdmin()
  const { id } = await params

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = updateAdminPromoCodeSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation error', details: parsed.error.flatten() },
      { status: 400 }
    )
  }

  const data = parsed.data
  const normalizedCode = data.code === undefined ? undefined : normalizePromoCode(data.code)
  if (data.code !== undefined && !normalizedCode) {
    return NextResponse.json({ error: 'Введите промокод' }, { status: 400 })
  }

  const existing = await prisma.promoCode.findUnique({
    where: { id },
    select: { audience: true, allowedEmails: true },
  })
  if (!existing) {
    return NextResponse.json({ error: 'Промокод не найден' }, { status: 404 })
  }

  const effectiveAudience = data.audience ?? existing.audience
  const effectiveAllowedEmails =
    effectiveAudience === 'PERSONAL'
      ? normalizeAllowedEmails(data.allowedEmails ?? existing.allowedEmails)
      : []

  if (effectiveAudience === 'PERSONAL' && effectiveAllowedEmails.length === 0) {
    return NextResponse.json(
      { error: 'Для персонального промокода укажите хотя бы одного пользователя' },
      { status: 400 }
    )
  }

  try {
    const promoCode = await prisma.$transaction(async (tx) => {
      const updateData: Prisma.PromoCodeUpdateInput = {}
      if (normalizedCode) updateData.code = normalizedCode
      if (data.discountPercent !== undefined) updateData.discountPercent = data.discountPercent
      updateData.audience = effectiveAudience
      updateData.allowedEmails = effectiveAllowedEmails
      if (data.isActive !== undefined) updateData.isActive = data.isActive
      if (data.startsAt !== undefined) updateData.startsAt = data.startsAt ? new Date(data.startsAt) : null
      if (data.expiresAt !== undefined) updateData.expiresAt = data.expiresAt ? new Date(data.expiresAt) : null
      if (data.maxUses !== undefined) updateData.maxUses = data.maxUses ?? null
      if (data.maxUsesPerUser !== undefined) updateData.maxUsesPerUser = data.maxUsesPerUser

      const updated = await tx.promoCode.update({
        where: { id },
        data: updateData,
      })

      if (data.planIds !== undefined) {
        await tx.promoCodePlan.deleteMany({ where: { promoCodeId: id } })
        if (data.planIds.length > 0) {
          await tx.promoCodePlan.createMany({
            data: data.planIds.map((planId) => ({ promoCodeId: id, planId })),
          })
        }
      }

      return updated
    })

    await writeAuditLog({
      actorId: session.uid,
      action: 'PROMO_CODE_UPDATED',
      message: 'Администратор обновил промокод',
      metadata: {
        promoCodeId: promoCode.id,
        code: promoCode.code,
        audience: promoCode.audience,
        allowedEmails: effectiveAllowedEmails,
        changedPlanIds: data.planIds,
      },
      request: req,
    })
    await syncCabinetPromoCodeToRemnashopBestEffort(promoCode.id)

    return NextResponse.json({ promoCode })
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === 'P2002') {
        return NextResponse.json({ error: 'Промокод с таким кодом уже существует' }, { status: 409 })
      }
      if (e.code === 'P2025') {
        return NextResponse.json({ error: 'Промокод не найден' }, { status: 404 })
      }
    }
    throw e
  }
})

export const DELETE = withAuth(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const session = await requireAdmin()
  const { id } = await params

  try {
    const existing = await prisma.promoCode.findUnique({
      where: { id },
      select: { id: true, code: true },
    })
    if (!existing) return NextResponse.json({ error: 'Промокод не найден' }, { status: 404 })
    await deactivateCabinetPromoCodesInRemnashopBestEffort([existing.code])
    const deleted = await prisma.promoCode.delete({
      where: { id },
      select: { id: true, code: true },
    })

    await writeAuditLog({
      actorId: session.uid,
      action: 'PROMO_CODE_UPDATED',
      message: 'Администратор удалил промокод',
      metadata: {
        promoCodeId: deleted.id,
        code: deleted.code,
      },
      request: req,
    })

    return NextResponse.json({ ok: true })
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
      return NextResponse.json({ error: 'Промокод не найден' }, { status: 404 })
    }
    throw e
  }
})

function normalizeAllowedEmails(emails: string[]) {
  return Array.from(new Set(emails.map((email) => email.trim().toLowerCase()).filter(Boolean)))
}
