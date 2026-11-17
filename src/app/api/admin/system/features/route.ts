import { jsonResponse } from '@/lib/json-response'
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
  // Необязателен, чтобы вкладка админки, открытая до обновления, не получала 422.
  newDesign: z.boolean().optional(),
}).strict()

export const GET = withAuth(async () => {
  await requireAdmin()
  return jsonResponse({ features: await getFeatureFlags() })
})

export const PATCH = withAuth(async (req: Request) => {
  const session = await requireAdmin()
  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return jsonResponse({ error: 'Некорректные настройки' }, { status: 422 })
  }

  const current = await getFeatureFlags()
  const features = await updateFeatureFlags({
    ...parsed.data,
    newDesign: parsed.data.newDesign ?? current.newDesign,
  })
  await writeAuditLog({
    actorId: session.uid,
    action: 'ADMIN_FEATURES_UPDATED',
    message: 'Обновлены функции кабинета',
    metadata: features,
    request: req,
  })

  return jsonResponse({ features })
})
