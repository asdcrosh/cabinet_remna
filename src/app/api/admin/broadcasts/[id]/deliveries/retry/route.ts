import { NextResponse } from 'next/server'
import { requireAdmin, withAuth } from '@/lib/auth/guard'
import { prisma } from '@/lib/prisma'
import { writeAuditLog } from '@/lib/audit-log'
import { isFeatureEnabled } from '@/lib/feature-flags'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const POST = withAuth(async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  if (!await isFeatureEnabled('broadcasts')) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const session = await requireAdmin()
  const { id } = await params
  const campaign = await prisma.broadcastCampaign.findUnique({
    where: { id },
    select: { id: true, title: true },
  })
  if (!campaign) return NextResponse.json({ error: 'Рассылка не найдена' }, { status: 404 })

  const result = await prisma.broadcastDelivery.updateMany({
    where: { campaignId: id, status: 'FAILED' },
    data: { status: 'PENDING', attempts: 0, lastError: null, lockedAt: null },
  })

  await writeAuditLog({
    actorId: session.uid,
    action: 'ADMIN_BROADCAST_RETRIED',
    message: 'Администратор повторно поставил ошибочные доставки рассылки в очередь',
    metadata: {
      entityType: 'broadcastCampaign',
      campaignId: campaign.id,
      title: campaign.title,
      retried: result.count,
    },
    request,
  })

  return NextResponse.json({ ok: true, retried: result.count })
})
