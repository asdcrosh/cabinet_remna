import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, withAuth } from '@/lib/auth/guard'
import { rateLimit } from '@/lib/rate-limit'
import {
  createSupportMessageSchema,
  serializeSupportMessage,
  serializeSupportTicket,
  userUpdateSupportTicketSchema,
} from '@/lib/support'
import { createAdminNotification } from '@/lib/admin-notifications'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = withAuth(async (_req: Request, { params }: { params: { id: string } }) => {
  const session = await requireAuth()

  const ticket = await prisma.supportTicket.findFirst({
    where: { id: params.id, userId: session.uid },
    include: {
      messages: {
        orderBy: { createdAt: 'asc' },
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

  if (ticket.userUnreadCount > 0) {
    await prisma.supportTicket.update({
      where: { id: ticket.id },
      data: { userUnreadCount: 0 },
    })
    ticket.userUnreadCount = 0
  }

  return NextResponse.json({
    ticket: {
      ...serializeSupportTicket(ticket),
      messages: ticket.messages.map(serializeSupportMessage),
    },
  })
})

export const POST = withAuth(async (req: Request, { params }: { params: { id: string } }) => {
  const session = await requireAuth()
  const limited = await rateLimit(req, `support:message:${session.uid}`, 20, 10 * 60 * 1000)
  if (!limited.ok) {
    return NextResponse.json({ error: 'Слишком много сообщений. Попробуйте позже.' }, { status: 429 })
  }

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

  const ticket = await prisma.supportTicket.findFirst({
    where: { id: params.id, userId: session.uid },
    select: { id: true, status: true },
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
        senderRole: 'USER',
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
        status: 'WAITING_ADMIN',
        adminUnreadCount: { increment: 1 },
        lastMessageAt: created.createdAt,
      },
    })
    return created
  })

  await createAdminNotification({
    type: 'support',
    severity: 'INFO',
    dedupeKey: `admin:support-message:${message.id}`,
    title: 'Новое сообщение в поддержку',
    body: parsed.data.message.slice(0, 220),
    entityType: 'supportTicket',
    entityId: ticket.id,
    actionHref: '/dashboard/admin/support',
    actionLabel: 'Открыть чат',
  })

  return NextResponse.json({ message: serializeSupportMessage(message) }, { status: 201 })
})

export const PATCH = withAuth(async (req: Request, { params }: { params: { id: string } }) => {
  const session = await requireAuth()

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Некорректный запрос.' }, { status: 400 })
  }

  const parsed = userUpdateSupportTicketSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Пользователь может только закрыть обращение.', details: parsed.error.flatten() }, { status: 400 })
  }

  const ticket = await prisma.supportTicket.updateMany({
    where: { id: params.id, userId: session.uid },
    data: {
      status: parsed.data.status,
      closedAt: new Date(),
    },
  })

  if (ticket.count === 0) {
    return NextResponse.json({ error: 'Обращение не найдено.' }, { status: 404 })
  }

  return NextResponse.json({ ok: true })
})
