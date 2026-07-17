import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireStaff, withAuth } from '@/lib/auth/guard'
import { notifySupportReply } from '@/lib/notifications'
import { writeAuditLog } from '@/lib/audit-log'
import {
  createSupportMessageSchema,
  serializeSupportMessage,
  serializeSupportTicket,
  updateSupportTicketSchema,
} from '@/lib/support'
import { isFeatureEnabled } from '@/lib/feature-flags'

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
      user: {
        select: {
          id: true,
          email: true,
          name: true,
          telegramId: true,
          remnashopUserId: true,
          remnashopSyncedAt: true,
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
              status: true,
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
    await prisma.supportTicket.update({
      where: { id: ticket.id },
      data: { adminUnreadCount: 0 },
    })
    ticket.adminUnreadCount = 0
  }

  return NextResponse.json({
    ticket: {
      ...serializeSupportTicket(ticket),
      messages: messages.map(serializeSupportMessage),
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
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Некорректный запрос.' }, { status: 400 })
  }

  const parsed = createSupportMessageSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Напишите сообщение перед отправкой.', details: parsed.error.flatten() }, { status: 400 })
  }

  const ticket = await prisma.supportTicket.findUnique({
    where: { id },
    select: { id: true, status: true, userId: true },
  })
  if (!ticket) {
    return NextResponse.json({ error: 'Обращение не найдено.' }, { status: 404 })
  }
  if (ticket.status === 'CLOSED') {
    return NextResponse.json({ error: 'Обращение уже закрыто.' }, { status: 400 })
  }

  const message = await prisma.$transaction(async (tx) => {
    const created = await tx.supportMessage.create({
      data: {
        ticketId: ticket.id,
        senderId: session.uid,
        senderRole: 'ADMIN',
        body: parsed.data.message,
      },
      select: {
        id: true,
        body: true,
        senderRole: true,
        createdAt: true,
        sender: { select: { email: true, name: true } },
      },
    })
    await tx.supportTicket.update({
      where: { id: ticket.id },
      data: {
        status: 'WAITING_USER',
        userUnreadCount: { increment: 1 },
        adminUnreadCount: 0,
        lastMessageAt: created.createdAt,
      },
    })
    return created
  })

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
    return NextResponse.json({ error: 'Некорректный статус обращения.', details: parsed.error.flatten() }, { status: 400 })
  }

  const before = await prisma.supportTicket.findUnique({
    where: { id },
    select: { id: true, status: true, userId: true },
  })
  if (!before) {
    return NextResponse.json({ error: 'Обращение не найдено.' }, { status: 404 })
  }

  const ticket = await prisma.supportTicket.update({
    where: { id },
    data: {
      status: parsed.data.status,
      closedAt: parsed.data.status === 'CLOSED' ? new Date() : null,
    },
  })
  await writeAuditLog({
    actorId: session.uid,
    targetId: before.userId,
    action: 'ADMIN_SUPPORT_UPDATED',
    message: `Статус обращения изменён: ${before.status} → ${ticket.status}`,
    metadata: {
      ticketId: ticket.id,
      fromStatus: before.status,
      toStatus: ticket.status,
    },
    request: req,
  })

  return NextResponse.json({ ticket: serializeSupportTicket(ticket) })
})
