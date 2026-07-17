import { NextResponse } from 'next/server'
import { requireAdmin, withAuth } from '@/lib/auth/guard'
import { prisma } from '@/lib/prisma'
import { writeAuditLog } from '@/lib/audit-log'
import { isFeatureEnabled } from '@/lib/feature-flags'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const DELETE = withAuth(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  if (!await isFeatureEnabled('broadcasts')) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const session = await requireAdmin()
  const { id } = await params
  const template = await prisma.broadcastTemplate.findUnique({
    where: { id },
    select: { id: true, title: true, segment: true, channels: true },
  })
  await prisma.broadcastTemplate.delete({ where: { id } }).catch(() => null)
  if (template) {
    await writeAuditLog({
      actorId: session.uid,
      action: 'ADMIN_BROADCAST_TEMPLATE_DELETED',
      message: 'Администратор удалил шаблон рассылки',
      metadata: {
        entityType: 'broadcastTemplate',
        templateId: template.id,
        title: template.title,
        segment: template.segment,
        channels: template.channels,
      },
      request: req,
    })
  }
  return NextResponse.json({ ok: true })
})
