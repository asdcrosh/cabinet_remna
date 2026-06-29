import { NextResponse } from 'next/server'
import { requireAdmin, withAuth } from '@/lib/auth/guard'
import { AdminMergeUsersError, mergeTechnicalTelegramUserIntoEmailUser } from '@/lib/admin-user-merge'

export const POST = withAuth(async (req: Request) => {
  const session = await requireAdmin()
  const body = await req.json().catch(() => null)
  const sourceUserId = typeof body?.sourceUserId === 'string' ? body.sourceUserId.trim() : ''
  const targetUserId = typeof body?.targetUserId === 'string' ? body.targetUserId.trim() : ''

  if (!sourceUserId || !targetUserId) {
    return NextResponse.json({ error: 'sourceUserId and targetUserId are required' }, { status: 400 })
  }

  try {
    const result = await mergeTechnicalTelegramUserIntoEmailUser({
      sourceUserId,
      targetUserId,
      actorId: session.uid,
      request: req,
    })
    return NextResponse.json({ ok: true, result })
  } catch (error) {
    if (error instanceof AdminMergeUsersError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    throw error
  }
})
