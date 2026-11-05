// POST /api/mobile/auth/register — регистрация из приложения StealthNet.
// Логика общая с веб-регистрацией (registerWithPassword): письмо для подтверждения почты,
// реферальный код, связывание с Remnashop. Токены не выдаются — после подтверждения почты
// приложение входит через /api/mobile/auth/login.
import { jsonResponse } from '@/lib/json-response'
import { registerSchema } from '@/lib/auth/validation'
import { rateLimit } from '@/lib/rate-limit'
import { registerWithPassword } from '@/lib/auth/password-register'

export const runtime = 'nodejs'

// Без поля next: после подтверждения почты пользователь возвращается в приложение.
const bodySchema = registerSchema.omit({ next: true })

export async function POST(req: Request) {
  const limited = await rateLimit(req, 'mobile-auth-register', 5, 60_000)
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
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return jsonResponse({ error: 'Validation error', details: parsed.error.flatten() }, { status: 400 })
  }

  const result = await registerWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
    name: parsed.data.name,
    referralCode: parsed.data.referralCode,
  })
  if (result.kind === 'referral_not_found') {
    return jsonResponse({ error: 'Реферальный код не найден' }, { status: 404 })
  }

  // Одинаковый ответ для новой и уже занятой почты: по нему нельзя узнать, есть ли аккаунт.
  return jsonResponse({ requiresEmailVerification: true }, { status: 202 })
}
