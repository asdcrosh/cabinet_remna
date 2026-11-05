// GET /api/mobile/auth/sessions — устройства, где выполнен вход в приложение StealthNet.
// Доступно и из приложения (Bearer), и из веб-кабинета (cookie).
import { jsonResponse } from '@/lib/json-response'
import { requireAuth, withAuth } from '@/lib/auth/guard'
import { isMobileSession } from '@/lib/auth/jwt'
import { listMobileSessions } from '@/lib/auth/mobile-session'

export const runtime = 'nodejs'

export const GET = withAuth(async () => {
  const session = await requireAuth()
  const currentId = isMobileSession(session) ? session.sid : null
  const sessions = await listMobileSessions(session.uid)
  return jsonResponse({
    sessions: sessions.map((s) => ({ ...s, current: s.id === currentId })),
  })
})
