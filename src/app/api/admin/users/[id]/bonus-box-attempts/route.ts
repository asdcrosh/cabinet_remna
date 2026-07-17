import { NextResponse } from 'next/server'
import { z } from 'zod'
import { BonusBoxError, grantManualBonusBoxAttempts } from '@/lib/bonus-box'
import { requireSuperAdmin, withAuth } from '@/lib/auth/guard'
import { notifyBonusGranted } from '@/lib/notifications'
import { writeAuditLog } from '@/lib/audit-log'
import { isFeatureEnabled } from '@/lib/feature-flags'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema = z.object({
  attemptsCount: z.coerce.number().int().min(1).max(100),
})

export const POST = withAuth(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  if (!await isFeatureEnabled('bonusBox')) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const session = await requireSuperAdmin()
  const { id } = await params

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Укажите количество от 1 до 100' }, { status: 400 })
  }

  try {
    const result = await grantManualBonusBoxAttempts({
      userId: id,
      adminId: session.uid,
      attemptsCount: parsed.data.attemptsCount,
    })
    await notifyBonusGranted({ userId: id, attemptsCount: parsed.data.attemptsCount })
    await writeAuditLog({
      actorId: session.uid,
      targetId: id,
      action: 'ADMIN_BONUS_ATTEMPTS_GRANTED',
      message: `Выданы попытки подарочного бокса: ${result.granted}`,
      metadata: {
        requested: parsed.data.attemptsCount,
        granted: result.granted,
        availableAttempts: result.attemptsCount,
      },
      request: req,
    })
    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof BonusBoxError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
    }
    throw error
  }
})
