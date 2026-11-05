// POST /api/mobile/auth/oauth/exchange — обмен одноразового кода на токены приложения.
// Тело: { code, codeVerifier, hwid }. Код одноразовый, живёт 2 минуты и принимается
// только с code_verifier (PKCE) и с того же устройства, что начало вход.
import { z } from 'zod'
import { jsonResponse } from '@/lib/json-response'
import { rateLimit } from '@/lib/rate-limit'
import { createMobileSession, mobileDeviceSchema } from '@/lib/auth/mobile-session'
import { codeVerifierSchema, exchangeMobileAuthCode } from '@/lib/auth/mobile-oauth'

export const runtime = 'nodejs'

const bodySchema = z.object({
  code: z.string().trim().min(20).max(200),
  codeVerifier: codeVerifierSchema,
  hwid: mobileDeviceSchema.shape.hwid,
})

const ERRORS = {
  invalid: 'Код входа недействителен. Повторите вход.',
  expired: 'Код входа истёк. Повторите вход.',
  verifier_mismatch: 'Код входа недействителен. Повторите вход.',
  device_mismatch: 'Вход начат на другом устройстве. Повторите вход.',
} as const

export async function POST(req: Request) {
  const limited = await rateLimit(req, 'mobile-oauth-exchange', 20, 60_000)
  if (!limited.ok) {
    return jsonResponse(
      { error: 'Слишком много запросов. Попробуйте позже.' },
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

  const result = await exchangeMobileAuthCode(parsed.data.code, parsed.data.codeVerifier, parsed.data.hwid)
  if (!result.ok) {
    return jsonResponse({ error: ERRORS[result.reason], code: result.reason.toUpperCase() }, { status: 401 })
  }

  const tokens = await createMobileSession(result.user, result.device, req)
  return jsonResponse(
    { ...tokens, user: result.user },
    { headers: { 'Cache-Control': 'no-store' } }
  )
}
