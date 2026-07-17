import { NextResponse } from 'next/server'
import { z } from 'zod'
import { writeAuditLog } from '@/lib/audit-log'
import { requireAdmin, withAuth } from '@/lib/auth/guard'
import { getFeatureFlags, updateFeatureFlags } from '@/lib/feature-flags'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema = z.object({
  referrals: z.boolean(),
  bonusBox: z.boolean(),
  support: z.boolean(),
  broadcasts: z.boolean(),
}).strict()

export const GET = withAuth(async () => {
  await requireAdmin()
  return NextResponse.json({ features: await getFeatureFlags() })
})

export const PATCH = withAuth(async (req: Request) => {
  const session = await requireAdmin()
  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Некорректные настройки' }, { status: 422 })
  }

  const features = await updateFeatureFlags(parsed.data)
  await writeAuditLog({
    actorId: session.uid,
    action: 'ADMIN_FEATURES_UPDATED',
    message: 'Обновлены функции кабинета',
    metadata: features,
    request: req,
  })

  return NextResponse.json({ features })
})
