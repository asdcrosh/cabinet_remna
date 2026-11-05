// POST /api/auth/login

import { jsonResponse } from '@/lib/json-response'
import { loginSchema } from '@/lib/auth/validation'
import { setSessionCookieOnResponse } from '@/lib/auth/cookies'
import { rateLimit } from '@/lib/rate-limit'
import { assertSameOrigin } from '@/lib/security'
import { authenticatePassword } from '@/lib/auth/password-login'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  try {
    assertSameOrigin(req)
  } catch {
    return jsonResponse({ error: 'Invalid request origin' }, { status: 403 })
  }

  const limited = await rateLimit(req, 'auth-login', 10, 60_000)
  if (!limited.ok) {
    return jsonResponse(
      { error: 'Слишком много попыток входа. Попробуйте позже.' },
      { status: 429, headers: { 'Retry-After': String(limited.retryAfter) } }
    )
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = loginSchema.safeParse(body)
  if (!parsed.success) {
    return jsonResponse(
      { error: 'Validation error', details: parsed.error.flatten() },
      { status: 400 }
    )
  }

  const { email, password } = parsed.data
  const result = await authenticatePassword(email, password)
  if (!result.ok) {
    return jsonResponse(result.body, { status: result.status })
  }
  const { user } = result

  const res = jsonResponse({
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
  })
  return setSessionCookieOnResponse(res, {
    uid: user.id,
    email: user.email,
    role: user.role,
  })
}
