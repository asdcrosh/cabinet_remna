// POST /api/mobile/auth/logout — выход из приложения на этом устройстве.
// Работает по access-токену или, если он уже истёк, по refresh-токену в теле запроса.
import { z } from 'zod'
import { jsonResponse } from '@/lib/json-response'
import { getSession } from '@/lib/auth/cookies'
import { isMobileSession } from '@/lib/auth/jwt'
import { rateLimit } from '@/lib/rate-limit'
import { revokeMobileSession } from '@/lib/auth/mobile-session'

export const runtime = 'nodejs'

const bodySchema = z.object({ refreshToken: z.string().trim().min(20).max(200).optional() })

export async function POST(req: Request) {
  const limited = await rateLimit(req, 'mobile-auth-logout', 30, 60_000)
  if (!limited.ok) {
    return jsonResponse(
      { error: 'Слишком много запросов. Попробуйте позже.' },
      { status: 429, headers: { 'Retry-After': String(limited.retryAfter) } }
    )
  }

  const session = await getSession()
  if (session && isMobileSession(session)) {
    await revokeMobileSession({ sessionId: session.sid, userId: session.uid })
    return jsonResponse({ ok: true })
  }

  let body: unknown = {}
  try {
    body = await req.json()
  } catch {
    body = {}
  }
  const parsed = bodySchema.safeParse(body)
  if (parsed.success && parsed.data.refreshToken) {
    await revokeMobileSession({ refreshToken: parsed.data.refreshToken })
  }
  // Ответ одинаковый независимо от того, была ли сессия: не раскрываем состояние токенов.
  return jsonResponse({ ok: true })
}
