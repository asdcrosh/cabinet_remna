import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireStaff, withAuth } from '@/lib/auth/guard'
import {
  createSupportMessageSchema,
  serializeSupportMessage,
  serializeSupportTicket,
  updateSupportTicketSchema,
} from '@/lib/support'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = withAuth(async (_req: Request, { params }: { params: { id: string } }) => {
  await requireStaff()

  const ticket = await prisma.supportTicket.findUnique({
    where: { id: params.id },
    include: {
      user: { select: { id: true, email: true, name: true, remnawaveUsername: true } },
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
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

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
      messages: ticket.messages.map(serializeSupportMessage),
    },
  })
})

export const POST = withAuth(async (req: Request, { params }: { params: { id: string } }) => {
  const session = await requireStaff()

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = createSupportMessageSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation error', details: parsed.error.flatten() }, { status: 400 })
  }

  const ticket = await prisma.supportTicket.findUnique({
    where: { id: params.id },
    select: { id: true, status: true },
  })
  if (!ticket) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  if (ticket.status === 'CLOSED') {
    return NextResponse.json({ error: 'Ticket is closed' }, { status: 400 })
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

  return NextResponse.json({ message: serializeSupportMessage(message) }, { status: 201 })
})

export const PATCH = withAuth(async (req: Request, { params }: { params: { id: string } }) => {
  await requireStaff()

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = updateSupportTicketSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation error', details: parsed.error.flatten() }, { status: 400 })
  }

  const ticket = await prisma.supportTicket.update({
    where: { id: params.id },
    data: {
      status: parsed.data.status,
      closedAt: parsed.data.status === 'CLOSED' ? new Date() : null,
    },
  })

  return NextResponse.json({ ticket: serializeSupportTicket(ticket) })
})
