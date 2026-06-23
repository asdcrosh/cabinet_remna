import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, withAuth } from '@/lib/auth/guard'
import { rateLimit } from '@/lib/rate-limit'
import { createSupportTicketSchema, serializeSupportMessage, serializeSupportTicket } from '@/lib/support'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = withAuth(async () => {
  const session = await requireAuth()

  const tickets = await prisma.supportTicket.findMany({
    where: { userId: session.uid },
    orderBy: { lastMessageAt: 'desc' },
    include: {
      messages: {
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { id: true, body: true, senderRole: true, createdAt: true },
      },
    },
  })

  return NextResponse.json({
    tickets: tickets.map((ticket) => ({
      ...serializeSupportTicket(ticket),
      messages: ticket.messages.map(serializeSupportMessage),
    })),
  })
})

export const POST = withAuth(async (req: Request) => {
  const session = await requireAuth()
  const limited = await rateLimit(req, `support:create:${session.uid}`, 5, 10 * 60 * 1000)
  if (!limited.ok) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = createSupportTicketSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation error', details: parsed.error.flatten() }, { status: 400 })
  }

  const ticket = await prisma.$transaction(async (tx) => {
    const created = await tx.supportTicket.create({
      data: {
        userId: session.uid,
        subject: parsed.data.subject,
        category: parsed.data.category,
        status: 'WAITING_ADMIN',
        adminUnreadCount: 1,
        messages: {
          create: {
            senderId: session.uid,
            senderRole: 'USER',
            body: parsed.data.message,
          },
        },
      },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
          select: { id: true, body: true, senderRole: true, createdAt: true },
        },
      },
    })
    return created
  })

  return NextResponse.json({
    ticket: {
      ...serializeSupportTicket(ticket),
      messages: ticket.messages.map(serializeSupportMessage),
    },
  }, { status: 201 })
})
