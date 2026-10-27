// POST /api/auth/logout

import { jsonResponse } from '@/lib/json-response'
import { cookies } from 'next/headers'
import { clearSessionCookieOnResponse } from '@/lib/auth/cookies'
import { COOKIE_NAME, revokeSessionToken } from '@/lib/auth/jwt'
import { assertSameOrigin } from '@/lib/security'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  try {
    assertSameOrigin(req)
  } catch {
    return jsonResponse({ error: 'Invalid request origin' }, { status: 403 })
  }

  const cookieStore = await cookies()
  const token = cookieStore.get(COOKIE_NAME)?.value
  if (token) {
    await revokeSessionToken(token)
  }

  const res = jsonResponse({ ok: true })
  return clearSessionCookieOnResponse(res)
}
