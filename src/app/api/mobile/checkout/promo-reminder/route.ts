import { requireAuth, withAuth } from '@/lib/auth/guard'
import { jsonResponse } from '@/lib/json-response'
import { resolvePromoReminderCheckout } from '@/lib/promo-reminder-checkout'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = withAuth(async (request: Request) => {
  const session = await requireAuth()
  const id = new URL(request.url).searchParams.get('id') ?? ''
  const reminder = await resolvePromoReminderCheckout(session.uid, id)
  if (reminder.error) {
    return jsonResponse({ error: reminder.error, code: 'PROMO_REMINDER_UNAVAILABLE' }, { status: 404 })
  }
  return jsonResponse(
    { code: reminder.code, planIds: reminder.planIds },
    { headers: { 'Cache-Control': 'private, no-store' } },
  )
})
