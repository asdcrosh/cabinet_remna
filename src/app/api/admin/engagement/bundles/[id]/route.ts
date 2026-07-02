import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdmin, withAuth } from '@/lib/auth/guard'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema = z.object({
  enabled: z.boolean(),
  title: z.string().trim().min(3).max(120),
  description: z.string().trim().min(5).max(400),
  cta: z.string().trim().min(2).max(40),
  href: z.string().trim().min(1).max(600),
  minPlanDurationDays: z.coerce.number().int().min(1).max(3650).optional().nullable(),
  bonusAttempts: z.coerce.number().int().min(0).max(100),
  bonusMultiplier: z.coerce.number().int().min(1).max(10),
  promoCodeId: z.string().trim().optional().nullable(),
  showOnHome: z.boolean(),
  showOnPlans: z.boolean(),
  showInBroadcasts: z.boolean(),
  showAsPersonalOffer: z.boolean(),
})

export const PATCH = withAuth(async (req: Request, { params }: { params: { id: string } }) => {
  await requireAdmin()
  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Проверьте настройки bundle' }, { status: 400 })
  }
  if (!parsed.data.href.startsWith('/dashboard')) {
    return NextResponse.json({ error: 'Ссылка должна вести внутри кабинета' }, { status: 400 })
  }

  const bundle = await prisma.engagementBundleSetting.update({
    where: { id: params.id },
    data: {
      ...parsed.data,
      promoCodeId: parsed.data.promoCodeId || null,
      minPlanDurationDays: parsed.data.minPlanDurationDays ?? null,
    },
  })
  return NextResponse.json({ bundle })
})
