import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { requireStaff, withAuth } from '@/lib/auth/guard'
import { notifySupportReply } from '@/lib/notifications'
import { writeAuditLog } from '@/lib/audit-log'
import {
  createSupportMessageSchema,
  serializeSupportInternalNote,
  serializeSupportMessage,
  serializeSupportTicket,
  updateSupportTicketSchema,
} from '@/lib/support'
import { isFeatureEnabled } from '@/lib/feature-flags'
import {
  readSupportMutationRequest,
  SupportAttachmentError,
  supportAttachmentSelect,
} from '@/lib/support-attachments'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const MESSAGE_PAGE_SIZE = 50

export const GET = withAuth(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  if (!await isFeatureEnabled('support')) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  await requireStaff()
  const { id } = await params
  const before = new URL(req.url).searchParams.get('before')?.trim() || null

  const ticket = await prisma.supportTicket.findUnique({
    where: { id },
    include: {
      assignee: { select: { id: true, email: true, name: true } },
      user: {
        select: {
          id: true,
          email: true,
          name: true,
          telegramId: true,
          telegramUsername: true,
          remnashopUserId: true,
          remnashopSyncedAt: true,
          remnawaveId: true,
          remnawaveUuid: true,
          remnawaveUsername: true,
          subscriptions: {
            orderBy: { expireAt: 'desc' },
            take: 1,
            select: { id: true, status: true, expireAt: true, pendingSync: true, plan: { select: { name: true } } },
          },
          payments: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: {
              id: true,
              provider: true,
              status: true,
              externalPaymentId: true,
              yookassaId: true,
              amountKopecks: true,
              paidAt: true,
              createdAt: true,
              subscriptionProvisionedAt: true,
              provisioningError: true,
              remnashopSyncedAt: true,
              remnashopSyncError: true,
              plan: { select: { name: true } },
            },
          },
        },
      },
      messages: {
        orderBy: { createdAt: 'desc' },
        take: MESSAGE_PAGE_SIZE + 1,
        ...(before ? { cursor: { id: before }, skip: 1 } : {}),
        select: {
          id: true,
          body: true,
          senderRole: true,
          createdAt: true,
          sender: { select: { email: true, name: true } },
          attachments: { select: supportAttachmentSelect },
        },
      },
      internalNotes: {
        orderBy: { createdAt: 'desc' },
        take: 50,
        select: {
          id: true,
          body: true,
          createdAt: true,
          author: { select: { id: true, email: true, name: true } },
        },
      },
    },
  })

  if (!ticket) {
    return NextResponse.json({ error: 'Обращение не найдено.' }, { status: 404 })
  }

  const hasOlderMessages = ticket.messages.length > MESSAGE_PAGE_SIZE
  const messages = ticket.messages.slice(0, MESSAGE_PAGE_SIZE).reverse()

  if (ticket.adminUnreadCount > 0) {
    const readState = await prisma.supportTicket.updateMany({
      where: {
        id: ticket.id,
        updatedAt: ticket.updatedAt,
        adminUnreadCount: { gt: 0 },
      },
      data: {
        adminUnreadCount: 0,
        updatedAt: ticket.updatedAt,
      },
    })
    if (readState.count === 1) ticket.adminUnreadCount = 0
  }

  const auditEvents = await prisma.auditLog.findMany({
    where: {
      action: 'ADMIN_SUPPORT_UPDATED',
      metadata: { path: ['ticketId'], equals: ticket.id },
    },
    orderBy: { createdAt: 'asc' },
    take: 100,
    select: {
      id: true,
      message: true,
      createdAt: true,
      actor: { select: { id: true, email: true, name: true } },
    },
  })

  return NextResponse.json({
    ticket: {
      ...serializeSupportTicket(ticket),
      messages: messages.map(serializeSupportMessage),
      internalNotes: ticket.internalNotes.reverse().map(serializeSupportInternalNote),
      auditEvents: auditEvents.map((event) => ({
        ...event,
        createdAt: event.createdAt.toISOString(),
      })),
      messagePagination: {
        hasMore: hasOlderMessages,
        before: hasOlderMessages ? messages[0]?.id ?? null : null,
      },
    },
  })
})

export const POST = withAuth(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  if (!await isFeatureEnabled('support')) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const session = await requireStaff()
  const { id } = await params

  let body: unknown
  let attachments: Awaited<ReturnType<typeof readSupportMutationRequest>>['attachments'] = []
  try {
    const requestData = await readSupportMutationRequest(req)
    body = requestData.body
    attachments = requestData.attachments
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof SupportAttachmentError ? error.message : 'Некорректный запрос.' },
      { status: 400 }
    )
  }

  const parsed = createSupportMessageSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Напишите сообщение перед отправкой.', details: parsed.error.flatten() }, { status: 400 })
  }

  const ticket = await prisma.supportTicket.findUnique({
    where: { id },
    select: { id: true, status: true, userId: true, assigneeId: true },
  })
  if (!ticket) {
    return NextResponse.json({ error: 'Обращение не найдено.' }, { status: 404 })
  }
  if (ticket.status === 'CLOSED') {
    return NextResponse.json({ error: 'Обращение уже закрыто.' }, { status: 400 })
  }

  const result = await prisma.$transaction(async (tx) => {
    const created = await tx.supportMessage.create({
      data: {
        ticketId: ticket.id,
        senderId: session.uid,
        senderRole: 'ADMIN',
        clientMessageId: parsed.data.clientMessageId,
        body: parsed.data.message,
        ...(attachments.length > 0 ? { attachments: { create: attachments } } : {}),
      },
      select: {
        id: true,
        body: true,
        senderRole: true,
        createdAt: true,
        sender: { select: { email: true, name: true } },
        attachments: { select: supportAttachmentSelect },
      },
    })
    await tx.supportTicket.update({
      where: { id: ticket.id },
      data: {
        status: 'WAITING_USER',
        userUnreadCount: { increment: 1 },
        adminUnreadCount: 0,
        lastMessageAt: created.createdAt,
        ...(!ticket.assigneeId ? { assigneeId: session.uid, assignedAt: created.createdAt } : {}),
      },
    })
    return { message: created, created: true as const }
  }).catch(async (error) => {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError)
      || error.code !== 'P2002'
      || !parsed.data.clientMessageId) throw error
    const existing = await prisma.supportMessage.findUnique({
      where: {
        ticketId_clientMessageId: {
          ticketId: ticket.id,
          clientMessageId: parsed.data.clientMessageId,
        },
      },
      select: {
        id: true,
        body: true,
        senderRole: true,
        createdAt: true,
        sender: { select: { email: true, name: true } },
        attachments: { select: supportAttachmentSelect },
      },
    })
    if (!existing) throw error
    return { message: existing, created: false as const }
  })
  const message = result.message
  if (!result.created) {
    return NextResponse.json({ message: serializeSupportMessage(message) }, { status: 200 })
  }

  await notifySupportReply({ ticketId: ticket.id, messageId: message.id })
  await writeAuditLog({
    actorId: session.uid,
    targetId: ticket.userId,
    action: 'ADMIN_SUPPORT_UPDATED',
    message: 'Администратор ответил в обращении',
    metadata: {
      ticketId: ticket.id,
      messageId: message.id,
      fromStatus: ticket.status,
      toStatus: 'WAITING_USER',
    },
    request: req,
  })

  return NextResponse.json({ message: serializeSupportMessage(message) }, { status: 201 })
})

export const PATCH = withAuth(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  if (!await isFeatureEnabled('support')) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const session = await requireStaff()
  const { id } = await params

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Некорректный запрос.' }, { status: 400 })
  }

  const parsed = updateSupportTicketSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Некорректное обновление обращения.', details: parsed.error.flatten() }, { status: 400 })
  }

  const before = await prisma.supportTicket.findUnique({
    where: { id },
    select: { id: true, status: true, userId: true, assigneeId: true, updatedAt: true },
  })
  if (!before) {
    return NextResponse.json({ error: 'Обращение не найдено.' }, { status: 404 })
  }

  if (parsed.data.assigneeId) {
    const assignee = await prisma.user.findFirst({
      where: {
        id: parsed.data.assigneeId,
        role: { in: ['MODERATOR', 'ADMIN', 'SUPER_ADMIN'] },
      },
      select: { id: true },
    })
    if (!assignee) {
      return NextResponse.json({ error: 'Исполнитель не найден.' }, { status: 400 })
    }
  }

  const updated = await prisma.supportTicket.updateMany({
    where: {
      id,
      updatedAt: new Date(parsed.data.expectedUpdatedAt),
    },
    data: {
      ...(parsed.data.status
        ? {
            status: parsed.data.status,
            closedAt: parsed.data.status === 'CLOSED' ? new Date() : null,
          }
        : {}),
      ...(parsed.data.assigneeId !== undefined
        ? {
            assigneeId: parsed.data.assigneeId,
            assignedAt: parsed.data.assigneeId ? new Date() : null,
          }
        : {}),
    },
  })
  if (updated.count !== 1) {
    const current = await prisma.supportTicket.findUnique({
      where: { id },
      include: { assignee: { select: { id: true, email: true, name: true } } },
    })
    if (!current) {
      return NextResponse.json({ error: 'Обращение не найдено.' }, { status: 404 })
    }
    return NextResponse.json(
      {
        error: 'Обращение уже изменил другой сотрудник. Показано актуальное состояние.',
        ticket: serializeSupportTicket(current),
      },
      { status: 409 }
    )
  }

  const ticket = await prisma.supportTicket.findUnique({
    where: { id },
    include: { assignee: { select: { id: true, email: true, name: true } } },
  })
  if (!ticket) {
    return NextResponse.json({ error: 'Обращение не найдено.' }, { status: 404 })
  }
  const changes = [
    parsed.data.status && parsed.data.status !== before.status
      ? `статус ${before.status} → ${parsed.data.status}`
      : '',
    parsed.data.assigneeId !== undefined && parsed.data.assigneeId !== before.assigneeId
      ? parsed.data.assigneeId ? 'назначен исполнитель' : 'исполнитель снят'
      : '',
  ].filter(Boolean)
  await writeAuditLog({
    actorId: session.uid,
    targetId: before.userId,
    action: 'ADMIN_SUPPORT_UPDATED',
    message: `Обращение обновлено: ${changes.join(', ') || 'без изменений'}`,
    metadata: {
      ticketId: ticket.id,
      ...(parsed.data.status ? { fromStatus: before.status, toStatus: ticket.status } : {}),
      ...(parsed.data.assigneeId !== undefined
        ? { fromAssigneeId: before.assigneeId, toAssigneeId: ticket.assigneeId }
        : {}),
    },
    request: req,
  })

  return NextResponse.json({ ticket: serializeSupportTicket(ticket) })
})
