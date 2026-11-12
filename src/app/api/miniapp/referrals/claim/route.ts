import { requireAuth, withAuth } from '@/lib/auth/guard'
import { jsonResponse } from '@/lib/json-response'
import { rateLimit } from '@/lib/rate-limit'
import { requireMiniApp } from '@/lib/miniapp/config'
import { claimChannelReward } from '@/lib/miniapp/channel-referrals'

export const POST = withAuth(async (req: Request) => {
  requireMiniApp()
  const session = await requireAuth()
  const limit = await rateLimit(req, `channel-claim:${session.uid}`, 3, 60_000)
  if (!limit.ok) return jsonResponse({ error: 'Подождите минуту перед новой проверкой' }, { status: 429 })
  return jsonResponse(await claimChannelReward(session.uid))
})
