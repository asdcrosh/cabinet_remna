import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { writeAuditLog } from '@/lib/audit-log'
import { requireStaff, withAuth } from '@/lib/auth/guard'
import { serializeSupportTicket } from '@/lib/support'
import { isFeatureEnabled } from '@/lib/feature-flags'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema = z.object({
  tickets: z.array(z.object({
    id: z.string().min(1).max(100),
    expectedUpdatedAt: z.string().datetime(),
  }).strict()).min(1).max(50),
  action: z.discriminatedUnion('type', [
    z.object({ type: z.literal('assign'), assigneeId: z.string().min(1).max(100).nullable() }).strict(),
    z.object({ type: z.literal('close') }).strict(),
  ]),
}).strict()

export const POST = withAuth(async (req: Request) => {
  if (!await isFeatureEnabled('support')) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const session = await requireStaff()
  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Некорректная массовая операция.', details: parsed.error.flatten() }, { status: 422 })
  }

  const { tickets, action } = parsed.data
  if (action.type === 'assign' && action.assigneeId) {
    const assignee = await prisma.user.findFirst({
      where: { id: action.assigneeId, role: { in: ['MODERATOR', 'ADMIN', 'SUPER_ADMIN'] } },
      select: { id: true },
    })
    if (!assignee) return NextResponse.json({ error: 'Исполнитель не найден.' }, { status: 400 })
  }

  const currentTickets = await prisma.supportTicket.findMany({
    where: { id: { in: tickets.map((ticket) => ticket.id) } },
    select: { id: true, userId: true, status: true, assigneeId: true },
  })
  const currentById = new Map(currentTickets.map((ticket) => [ticket.id, ticket]))
  const updated = []
  const failed: Array<{ id: string; reason: 'not_found' | 'conflict' }> = []

  for (const input of tickets) {
    const before = currentById.get(input.id)
    if (!before) {
      failed.push({ id: input.id, reason: 'not_found' })
      continue
    }
    const result = await prisma.supportTicket.updateMany({
      where: { id: input.id, updatedAt: new Date(input.expectedUpdatedAt) },
      data: action.type === 'close'
        ? { status: 'CLOSED', closedAt: new Date() }
        : {
            assigneeId: action.assigneeId,
            assignedAt: action.assigneeId ? new Date() : null,
          },
    })
    if (result.count !== 1) {
      failed.push({ id: input.id, reason: 'conflict' })
      continue
    }

    const ticket = await prisma.supportTicket.findUnique({
      where: { id: input.id },
      include: { assignee: { select: { id: true, email: true, name: true } } },
    })
    if (!ticket) {
      failed.push({ id: input.id, reason: 'not_found' })
      continue
    }
    updated.push(serializeSupportTicket(ticket))
    await writeAuditLog({
      actorId: session.uid,
      targetId: before.userId,
      action: 'ADMIN_SUPPORT_UPDATED',
      message: action.type === 'close'
        ? 'Обращение закрыто массовой операцией'
        : action.assigneeId ? 'Исполнитель назначен массовой операцией' : 'Исполнитель снят массовой операцией',
      metadata: {
        ticketId: ticket.id,
        bulk: true,
        ...(action.type === 'close'
          ? { fromStatus: before.status, toStatus: ticket.status }
          : { fromAssigneeId: before.assigneeId, toAssigneeId: ticket.assigneeId }),
      },
      request: req,
    })
  }

  return NextResponse.json({ updated, failed })
})
