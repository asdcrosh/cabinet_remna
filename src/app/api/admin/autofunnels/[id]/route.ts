import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdmin, withAuth } from '@/lib/auth/guard'
import { updateAutoFunnelSetting } from '@/lib/autofunnels'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema = z.object({
  enabled: z.boolean(),
  triggerDays: z.coerce.number().int().min(1).max(3650),
  cooldownDays: z.coerce.number().int().min(1).max(3650),
  channels: z.array(z.enum(['IN_APP', 'TELEGRAM', 'EMAIL'])).min(1).max(3),
  messageTitle: z.string().trim().min(3).max(120),
  messageBody: z.string().trim().min(5).max(1200),
  actionHref: z.string().trim().min(1).max(600),
  actionLabel: z.string().trim().min(1).max(40),
  actionOpenInTelegram: z.boolean(),
  bonusAttempts: z.coerce.number().int().min(0).max(50),
  promoCodeId: z.string().trim().optional().nullable(),
  maxRecipientsPerRun: z.coerce.number().int().min(1).max(5000),
})

export const PATCH = withAuth(async (req: Request, { params }: { params: { id: string } }) => {
  await requireAdmin()
  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Проверьте настройки автоворонки' }, { status: 400 })
  }

  const funnel = await updateAutoFunnelSetting(params.id, parsed.data)
  return NextResponse.json({ funnel })
})
