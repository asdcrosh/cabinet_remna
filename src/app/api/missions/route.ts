import { NextResponse } from 'next/server'
import { requireAuth, withAuth } from '@/lib/auth/guard'
import { getUserMissions, claimMissionReward, MissionError } from '@/lib/missions'
import { rateLimit } from '@/lib/rate-limit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = withAuth(async () => {
  const session = await requireAuth()
  const missions = await getUserMissions(session.uid)
  return NextResponse.json({ missions })
})

export const POST = withAuth(async (req: Request) => {
  const session = await requireAuth()
  const limited = await rateLimit(req, `mission-claim:${session.uid}`, 20, 60_000)
  if (!limited.ok) {
    return NextResponse.json(
      { error: 'Слишком много запросов. Попробуйте позже.' },
      { status: 429, headers: { 'Retry-After': String(limited.retryAfter) } }
    )
  }

  const body = (await req.json().catch(() => null)) as { missionKey?: unknown } | null
  if (typeof body?.missionKey !== 'string') {
    return NextResponse.json({ error: 'Mission key is required' }, { status: 400 })
  }

  try {
    const result = await claimMissionReward(session.uid, body.missionKey)
    const missions = await getUserMissions(session.uid)
    return NextResponse.json({ ...result, missions })
  } catch (error) {
    if (error instanceof MissionError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
    }
    throw error
  }
})
