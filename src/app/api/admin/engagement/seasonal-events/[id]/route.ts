import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdmin, withAuth } from '@/lib/auth/guard'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema = z.object({
  enabled: z.boolean(),
  title: z.string().trim().min(3).max(120),
  description: z.string().trim().min(5).max(500),
  audience: z.enum(['ALL', 'ACTIVE', 'INACTIVE', 'TELEGRAM']),
  recurringWeekday: z.coerce.number().int().min(0).max(6).optional().nullable(),
  notifyInApp: z.boolean(),
  notifyTelegram: z.boolean(),
  actionHref: z.string().trim().min(1).max(600),
  actionLabel: z.string().trim().min(2).max(40),
  bonusAttempts: z.coerce.number().int().min(0).max(100),
  promoCodeId: z.string().trim().optional().nullable(),
  notificationCooldownHours: z.coerce.number().int().min(1).max(24 * 30),
})

export const PATCH = withAuth(async (req: Request, { params }: { params: { id: string } }) => {
  await requireAdmin()
  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Проверьте настройки события' }, { status: 400 })
  }
  if (!parsed.data.actionHref.startsWith('/dashboard')) {
    return NextResponse.json({ error: 'Ссылка должна вести внутри кабинета' }, { status: 400 })
  }

  const event = await prisma.seasonalBonusEvent.update({
    where: { id: params.id },
    data: {
      ...parsed.data,
      promoCodeId: parsed.data.promoCodeId || null,
      recurringWeekday: parsed.data.recurringWeekday ?? null,
    },
  })
  return NextResponse.json({ event })
})
