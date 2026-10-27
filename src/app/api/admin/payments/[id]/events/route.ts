import { jsonResponse } from '@/lib/json-response'
import { prisma } from '@/lib/prisma'
import { requireAdmin, withAuth } from '@/lib/auth/guard'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = withAuth(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  await requireAdmin()
  const { id } = await params
  const payment = await prisma.payment.findUnique({ where: { id }, select: { id: true } })
  if (!payment) return jsonResponse({ error: 'Платёж не найден' }, { status: 404 })

  const events = await prisma.paymentEvent.findMany({
    where: { paymentId: id },
    orderBy: { updatedAt: 'desc' },
    take: 100,
  })
  return jsonResponse({
    events: events.map((event) => ({
      ...event,
      createdAt: event.createdAt.toISOString(),
      updatedAt: event.updatedAt.toISOString(),
    })),
  })
})
