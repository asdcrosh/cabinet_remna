import { jsonResponse } from '@/lib/json-response'
import { resetPasswordSchema } from '@/lib/auth/validation'
import { rateLimit } from '@/lib/rate-limit'
import { resetPasswordByToken } from '@/lib/password-reset'
import { assertSameOrigin } from '@/lib/security'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  try {
    assertSameOrigin(req)
  } catch {
    return jsonResponse({ error: 'Invalid request origin' }, { status: 403 })
  }

  const limited = await rateLimit(req, 'reset-password', 30, 60_000)
  if (!limited.ok) {
    return jsonResponse(
      { error: 'Слишком много попыток. Попробуйте позже.' },
      { status: 429, headers: { 'Retry-After': String(limited.retryAfter) } }
    )
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = resetPasswordSchema.safeParse(body)
  if (!parsed.success) {
    return jsonResponse(
      { error: 'Validation error', details: parsed.error.flatten() },
      { status: 400 }
    )
  }

  const result = await resetPasswordByToken(parsed.data)
  if (!result.ok) {
    return jsonResponse({ error: 'Ссылка недействительна или истекла' }, { status: 400 })
  }

  return jsonResponse({ ok: true })
}
