import { NextResponse } from 'next/server'
import { requireAuth, withAuth } from '@/lib/auth/guard'
import { recordTelegramWebAppOpen } from '@/lib/missions'
import { rateLimit } from '@/lib/rate-limit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const POST = withAuth(async (req: Request) => {
  const session = await requireAuth()
  const limited = await rateLimit(req, `mission-telegram-open:${session.uid}`, 12, 60_000)
  if (!limited.ok) {
    return NextResponse.json({ ok: false }, { status: 429, headers: { 'Retry-After': String(limited.retryAfter) } })
  }

  await recordTelegramWebAppOpen(session.uid)
  return NextResponse.json({ ok: true })
})
