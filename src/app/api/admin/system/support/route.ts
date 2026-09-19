import { NextResponse } from 'next/server'
import { z } from 'zod'
import { writeAuditLog } from '@/lib/audit-log'
import { requireAdmin, withAuth } from '@/lib/auth/guard'
import { getSupportSettings, updateSupportSettings } from '@/lib/support-settings'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema = z.object({
  slaWarningMinutes: z.number().int().min(5).max(43_199),
  slaBreachMinutes: z.number().int().min(6).max(43_200),
  quickReplies: z.array(z.string().trim().min(1).max(500)).min(1).max(20),
}).strict().refine((value) => value.slaBreachMinutes > value.slaWarningMinutes, {
  message: 'Порог нарушения SLA должен быть больше предупреждения',
  path: ['slaBreachMinutes'],
})

export const GET = withAuth(async () => {
  await requireAdmin()
  return NextResponse.json({ settings: await getSupportSettings() })
})

export const PATCH = withAuth(async (req: Request) => {
  const session = await requireAdmin()
  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Некорректные настройки' }, { status: 422 })
  }

  const settings = await updateSupportSettings(parsed.data)
  await writeAuditLog({
    actorId: session.uid,
    action: 'ADMIN_SUPPORT_UPDATED',
    message: 'Обновлены SLA и шаблоны поддержки',
    metadata: { type: 'support_settings', ...settings },
    request: req,
  })
  return NextResponse.json({ settings })
})
