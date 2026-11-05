// DELETE /api/mobile/auth/sessions/:id — выйти из приложения на выбранном устройстве.
// Отзыв действует сразу: access-токен этого устройства перестаёт приниматься.
import { jsonResponse } from '@/lib/json-response'
import { requireAuth, withAuth } from '@/lib/auth/guard'
import { rateLimit } from '@/lib/rate-limit'
import { writeAuditLog } from '@/lib/audit-log'
import { revokeMobileSession } from '@/lib/auth/mobile-session'

export const runtime = 'nodejs'

export const DELETE = withAuth(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const session = await requireAuth()
  const limited = await rateLimit(req, `mobile-sessions:revoke:${session.uid}`, 20, 60_000)
  if (!limited.ok) {
    return jsonResponse(
      { error: 'Слишком много запросов. Попробуйте позже.' },
      { status: 429, headers: { 'Retry-After': String(limited.retryAfter) } }
    )
  }

  const { id } = await params
  // Отзываем только свою сессию: чужой id даёт тот же ответ «не найдено».
  const revoked = await revokeMobileSession({ sessionId: id, userId: session.uid }, 'revoked_by_user')
  if (!revoked) return jsonResponse({ error: 'Сессия не найдена' }, { status: 404 })

  await writeAuditLog({
    actorId: session.uid,
    targetId: session.uid,
    action: 'MOBILE_SESSION_REVOKED',
    message: 'Пользователь завершил сеанс приложения на устройстве',
    metadata: { sessionId: id },
    request: req,
  })
  return jsonResponse({ ok: true })
})
