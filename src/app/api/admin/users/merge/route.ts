import { jsonResponse } from '@/lib/json-response'
import { Prisma } from '@prisma/client'
import { requireSuperAdmin, withAuth } from '@/lib/auth/guard'
import { AdminMergeUsersError, mergeTechnicalTelegramUserIntoEmailUser } from '@/lib/admin-user-merge'
import { logError } from '@/lib/logger'

export const POST = withAuth(async (req: Request) => {
  const session = await requireSuperAdmin()
  const body = await req.json().catch(() => null)
  const sourceUserId = typeof body?.sourceUserId === 'string' ? body.sourceUserId.trim() : ''
  const targetUserId = typeof body?.targetUserId === 'string' ? body.targetUserId.trim() : ''

  if (!sourceUserId || !targetUserId) {
    return jsonResponse({ error: 'sourceUserId and targetUserId are required' }, { status: 400 })
  }

  try {
    const result = await mergeTechnicalTelegramUserIntoEmailUser({
      sourceUserId,
      targetUserId,
      actorId: session.uid,
      request: req,
    })
    return jsonResponse({ ok: true, result })
  } catch (error) {
    if (error instanceof AdminMergeUsersError) {
      return jsonResponse({ error: error.message }, { status: error.status })
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return jsonResponse(
        { error: 'Не удалось объединить: часть Telegram или Remnawave данных уже занята другим аккаунтом.' },
        { status: 409 }
      )
    }
    logError('admin.users.merge_failed', error, { sourceUserId, targetUserId, actorId: session.uid })
    return jsonResponse({ error: 'Не удалось объединить аккаунты' }, { status: 500 })
  }
})
