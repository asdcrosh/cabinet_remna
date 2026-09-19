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

  const result = await prisma.$transaction(async (tx) => {
    const canceled = await tx.broadcastDelivery.updateMany({
      where: { campaignId: id, status: { in: ['PENDING', 'FAILED'] } },
      data: { status: 'CANCELED', lockedAt: null },
    })
    const inFlight = await tx.broadcastDelivery.count({
      where: { campaignId: id, status: 'PROCESSING' },
    })
    return { canceled: canceled.count, inFlight }
  })

  await writeAuditLog({
    actorId: session.uid,
    action: 'ADMIN_BROADCAST_CANCELED',
    message: 'Администратор остановил оставшуюся очередь рассылки',
    metadata: {
      entityType: 'broadcastCampaign',
      campaignId: campaign.id,
      title: campaign.title,
      canceled: result.canceled,
      inFlight: result.inFlight,
    },
    request,
  })

  return NextResponse.json({ ok: true, ...result })
})
