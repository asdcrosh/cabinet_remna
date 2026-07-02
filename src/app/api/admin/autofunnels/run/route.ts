import { NextResponse } from 'next/server'
import { requireAdmin, withAuth } from '@/lib/auth/guard'
import { runAutoFunnels } from '@/lib/autofunnels'
import { rateLimit } from '@/lib/rate-limit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const POST = withAuth(async (req: Request) => {
  const session = await requireAdmin()
  const limited = await rateLimit(req, `admin-autofunnels-run:${session.uid}`, 5, 60_000)
  if (!limited.ok) {
    return NextResponse.json(
      { error: 'Слишком часто. Попробуйте позже.' },
      { status: 429, headers: { 'Retry-After': String(limited.retryAfter) } }
    )
  }

  const result = await runAutoFunnels()
  return NextResponse.json({ ok: true, ...result })
})
