import { NextResponse } from 'next/server'
import { requireAdmin, withAuth } from '@/lib/auth/guard'
import { isFeatureEnabled } from '@/lib/feature-flags'
import { prisma } from '@/lib/prisma'
import { writeAuditLog } from '@/lib/audit-log'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const PATCH = withAuth(async (
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) => {
  if (!await isFeatureEnabled('bonusBox')) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  const session = await requireAdmin()
  const { id } = await params
  const signal = await prisma.bonusBoxRiskSignal.update({
    where: { id },
    data: { reviewedAt: new Date() },
  })
  await writeAuditLog({
    actorId: session.uid,
    targetId: signal.userId,
    action: 'ADMIN_BONUS_RISK_REVIEWED',
    message: 'Проверен антифрод-сигнал бонусной системы',
    metadata: { signalId: signal.id, kind: signal.kind, score: signal.score },
    request: req,
  })
  return NextResponse.json({ signal })
})
