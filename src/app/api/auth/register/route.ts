// POST /api/auth/register
// Создаёт ЛОКАЛЬНЫЙ аккаунт ЛК. Remnawave-профиль НЕ создаём сразу —
// он понадобится только при первой покупке подписки.

import { jsonResponse } from '@/lib/json-response'
import { registerSchema } from '@/lib/auth/validation'
import { rateLimit } from '@/lib/rate-limit'
import { assertSameOrigin } from '@/lib/security'
import { sanitizeInternalNext } from '@/lib/auth/next-path'
import { registerWithPassword } from '@/lib/auth/password-register'

export const runtime = 'nodejs'

function neutralRegisterResponse() {
  return jsonResponse(
    {
      requiresEmailVerification: true,
      emailDelivery: 'sent',
    },
    { status: 202 }
  )
}

export async function POST(req: Request) {
  try {
    assertSameOrigin(req)
  } catch {
    return jsonResponse({ error: 'Invalid request origin' }, { status: 403 })
  }

  const limited = await rateLimit(req, 'auth-register', 5, 60_000)
  if (!limited.ok) {
    return jsonResponse(
      { error: 'Слишком много регистраций. Попробуйте позже.' },
      { status: 429, headers: { 'Retry-After': String(limited.retryAfter) } }
    )
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = registerSchema.safeParse(body)
  if (!parsed.success) {
    return jsonResponse(
      { error: 'Validation error', details: parsed.error.flatten() },
      { status: 400 }
    )
  }

  const next = sanitizeInternalNext(parsed.data.next)

  const result = await registerWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
    name: parsed.data.name,
    referralCode: parsed.data.referralCode,
    next,
  })
  if (result.kind === 'existing') return neutralRegisterResponse()
  if (result.kind === 'referral_not_found') {
    return jsonResponse({ error: 'Реферальный код не найден' }, { status: 404 })
  }

  return jsonResponse(
    {
      user: result.user,
      requiresEmailVerification: true,
      emailDelivery: result.emailDelivery,
      remnashopSync: result.remnashopSync,
    },
    { status: 201 }
  )
}
