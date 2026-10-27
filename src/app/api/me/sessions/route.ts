import { jsonResponse } from '@/lib/json-response'
import { clearSessionCookieOnResponse } from '@/lib/auth/cookies'
import { requireAuth, withAuth } from '@/lib/auth/guard'
import { prisma } from '@/lib/prisma'
import { rateLimit } from '@/lib/rate-limit'
import { writeAuditLog } from '@/lib/audit-log'

export const runtime = 'nodejs'

export const DELETE = withAuth(async (req: Request) => {
  const session = await requireAuth()
  const limited = await rateLimit(req, `sessions:revoke-all:${session.uid}`, 3, 60_000)
  if (!limited.ok) {
    return jsonResponse(
      { error: 'Слишком много попыток. Попробуйте позже.' },
      { status: 429, headers: { 'Retry-After': String(limited.retryAfter) } }
    )
  }

  const updated = await prisma.user.updateMany({
    where: { id: session.uid },
    data: { sessionVersion: { increment: 1 } },
  })
  if (updated.count === 0) {
    return jsonResponse({ error: 'Аккаунт не найден.' }, { status: 404 })
  }

  await writeAuditLog({
    actorId: session.uid,
    targetId: session.uid,
    action: 'USER_SESSIONS_REVOKED',
    message: 'Пользователь завершил все сеансы',
    request: req,
  })

  return clearSessionCookieOnResponse(jsonResponse({ ok: true }))
})
