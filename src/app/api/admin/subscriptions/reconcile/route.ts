import { NextResponse } from 'next/server'
import { requireAdmin, withAuth } from '@/lib/auth/guard'
import { prisma } from '@/lib/prisma'
import { rateLimit } from '@/lib/rate-limit'
import { assertSameOrigin } from '@/lib/security'
import { checkSubscriptionHealth, reconcileSubscriptionHealthBatch } from '@/lib/subscription-health'
import { writeAuditLog } from '@/lib/audit-log'
import { describeSyncError } from '@/lib/sync-error'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const POST = withAuth(async (req: Request) => {
  try {
    assertSameOrigin(req)
  } catch {
    return NextResponse.json({ error: 'Invalid request origin' }, { status: 403 })
  }

  const session = await requireAdmin()
  const limited = await rateLimit(req, `admin-subscription-reconcile:${session.uid}`, 20, 60_000)
  if (!limited.ok) {
    return NextResponse.json(
      { error: 'Слишком много запусков. Повторите позже.' },
      { status: 429, headers: { 'Retry-After': String(limited.retryAfter) } }
    )
  }

  const body = (await req.json().catch(() => null)) as {
    userId?: unknown
    mode?: unknown
    limit?: unknown
  } | null
  const userId = typeof body?.userId === 'string' ? body.userId : null
  const mode = body?.mode === 'CHECK' || body?.mode === 'AUTO' || body?.mode === 'REPAIR'
    ? body.mode
    : 'AUTO'
  const limit = typeof body?.limit === 'number' ? body.limit : 25

  if (mode === 'REPAIR' && !userId) {
    return NextResponse.json({ error: 'Для ручного исправления нужен пользователь.' }, { status: 400 })
  }

  try {
    if (userId) {
      const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, role: true } })
      if (!user) return NextResponse.json({ error: 'Пользователь не найден.' }, { status: 404 })

      const actor = await prisma.user.findUnique({ where: { id: session.uid }, select: { role: true } })
      if (user.role === 'SUPER_ADMIN' && actor?.role !== 'SUPER_ADMIN') {
        return NextResponse.json({ error: 'Изменять подписку главного администратора нельзя.' }, { status: 403 })
      }

      const result = await checkSubscriptionHealth({ userId, mode, actorId: session.uid })
      await writeAuditLog({
        actorId: session.uid,
        targetId: userId,
        action: 'ADMIN_PROFILE_UPDATED',
        message: mode === 'REPAIR' ? 'Администратор исправил расхождения подписки' : 'Администратор проверил подписку',
        metadata: {
          mode,
          status: result.status,
          issueCount: result.issues.length,
          changes: result.changes,
        },
        request: req,
      })
      return NextResponse.json({ ok: true, result })
    }

    const result = await reconcileSubscriptionHealthBatch({
      mode: mode === 'REPAIR' ? 'AUTO' : mode,
      limit,
      actorId: session.uid,
    })
    await writeAuditLog({
      actorId: session.uid,
      action: 'ADMIN_PROFILE_UPDATED',
      message: 'Администратор запустил проверку подписок',
      metadata: { mode, ...result },
      request: req,
    })
    return NextResponse.json({ ok: true, result })
  } catch (error) {
    return NextResponse.json({ error: describeSyncError(error) }, { status: 500 })
  }
})
