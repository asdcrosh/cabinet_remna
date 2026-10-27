import { jsonResponse } from '@/lib/json-response'
import { requireAdmin, withAuth } from '@/lib/auth/guard'
import { adminBonusBoxSettingsSchema } from '@/lib/auth/validation'
import { getBonusBoxSettings, updateBonusBoxSettings } from '@/lib/bonus-box'
import { writeAuditLog } from '@/lib/audit-log'
import { isFeatureEnabled } from '@/lib/feature-flags'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = withAuth(async () => {
  if (!await isFeatureEnabled('bonusBox')) return jsonResponse({ error: 'Not found' }, { status: 404 })
  await requireAdmin()
  const settings = await getBonusBoxSettings()
  return jsonResponse({ settings })
})

export const PATCH = withAuth(async (req: Request) => {
  if (!await isFeatureEnabled('bonusBox')) return jsonResponse({ error: 'Not found' }, { status: 404 })
  const session = await requireAdmin()

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = adminBonusBoxSettingsSchema.safeParse(body)
  if (!parsed.success) {
    return jsonResponse(
      { error: 'Validation error', details: parsed.error.flatten() },
      { status: 400 }
    )
  }

  const settings = await updateBonusBoxSettings(parsed.data)
  await writeAuditLog({
    actorId: session.uid,
    action: 'ADMIN_BONUS_SETTINGS_UPDATED',
    message: 'Обновлены настройки подарочного бокса',
    metadata: { settings },
    request: req,
  })

  return jsonResponse({ settings })
})
