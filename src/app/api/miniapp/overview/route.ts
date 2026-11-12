import { requireAuth, withAuth } from '@/lib/auth/guard'
import { jsonResponse } from '@/lib/json-response'
import { requireMiniApp } from '@/lib/miniapp/config'
import { getMiniAppOverview } from '@/lib/miniapp/overview'
import { rateLimit } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'
export const GET = withAuth(async (req: Request) => {
  requireMiniApp()
  const session = await requireAuth()
  const limit = await rateLimit(req, `miniapp-overview:${session.uid}`, 30, 60_000)
  if (!limit.ok) return jsonResponse({ error: 'Слишком много запросов' }, { status: 429 })
  return jsonResponse(await getMiniAppOverview(session.uid), { headers: { 'Cache-Control': 'private, no-store' } })
})
