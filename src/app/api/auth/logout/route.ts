// POST /api/auth/logout

import { NextResponse } from 'next/server'
import { clearSessionCookieOnResponse } from '@/lib/auth/cookies'
import { assertSameOrigin } from '@/lib/security'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  try {
    assertSameOrigin(req)
  } catch {
    return NextResponse.json({ error: 'Invalid request origin' }, { status: 403 })
  }

  const res = NextResponse.json({ ok: true })
  return clearSessionCookieOnResponse(res)
}
