// POST /api/mobile/auth/login — вход из приложения StealthNet.
// Логика проверки пароля общая с веб-входом (authenticatePassword).
// Ответ: access-токен (15 минут) и refresh-токен (60 дней, ротация).
import { jsonResponse } from '@/lib/json-response'
import { loginSchema } from '@/lib/auth/validation'
import { rateLimit } from '@/lib/rate-limit'
import { authenticatePassword } from '@/lib/auth/password-login'
import { createMobileSession, mobileDeviceSchema } from '@/lib/auth/mobile-session'

export const runtime = 'nodejs'

const bodySchema = loginSchema.extend({ device: mobileDeviceSchema })

const NO_STORE = { 'Cache-Control': 'no-store' }

export async function POST(req: Request) {
  const limited = await rateLimit(req, 'mobile-auth-login', 10, 60_000)
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
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return jsonResponse({ error: 'Validation error', details: parsed.error.flatten() }, { status: 400 })
  }
  const { email, password, device } = parsed.data


  const result = await authenticatePassword(email, password)
  if (!result.ok) {
    return jsonResponse(result.body, { status: result.status })
  }
  const { user } = result

  const tokens = await createMobileSession(user, device, req)
  return jsonResponse(
    {
      ...tokens,
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
    },
    { headers: NO_STORE }
  )
}
