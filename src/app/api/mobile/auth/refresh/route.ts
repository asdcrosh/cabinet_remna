// POST /api/mobile/auth/refresh — новая пара токенов приложения.
// Refresh принимается только с тем же HWID, с которым был выполнен вход.
// Повторное использование старого refresh отзывает сессию (признак кражи токена).
import { z } from 'zod'
import { jsonResponse } from '@/lib/json-response'
import { rateLimit } from '@/lib/rate-limit'
import { mobileDeviceSchema, rotateMobileSession } from '@/lib/auth/mobile-session'

export const runtime = 'nodejs'

const bodySchema = z.object({
  refreshToken: z.string().trim().min(20).max(200),
  hwid: mobileDeviceSchema.shape.hwid,
})

const ERRORS = {
  invalid: 'Сессия недействительна. Войдите снова.',
  expired: 'Сессия истекла. Войдите снова.',
  reused: 'Сессия завершена из соображений безопасности. Войдите снова.',
  device_mismatch: 'Сессия привязана к другому устройству. Войдите снова.',
} as const

export async function POST(req: Request) {
  const limited = await rateLimit(req, 'mobile-auth-refresh', 30, 60_000)
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

  const result = await rotateMobileSession(parsed.data.refreshToken, parsed.data.hwid, req)
  if (!result.ok) {
    return jsonResponse({ error: ERRORS[result.reason], code: result.reason.toUpperCase() }, { status: 401 })
  }
  return jsonResponse(result.tokens, { headers: { 'Cache-Control': 'no-store' } })
}
