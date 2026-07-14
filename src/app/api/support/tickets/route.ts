import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, withAuth } from '@/lib/auth/guard'
import { rateLimit } from '@/lib/rate-limit'
import {
  createSupportTicketSchema,
  serializeSupportMessage,
  serializeSupportTicket,
  supportCategorySubject,
} from '@/lib/support'
import { createAdminNotification } from '@/lib/admin-notifications'
import { isFeatureEnabled } from '@/lib/feature-flags'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = withAuth(async () => {
  if (!isFeatureEnabled('support')) return NextResponse.json({ error: 'Not found' }, { status: 404 })
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
  if (!isFeatureEnabled('support')) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const session = await requireAuth()
  const limited = await rateLimit(req, `support:create:${session.uid}`, 5, 10 * 60 * 1000)
  if (!limited.ok) {
    return NextResponse.json({ error: 'Слишком много обращений. Попробуйте позже.' }, { status: 429 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Некорректный запрос.' }, { status: 400 })
  }

  const parsed = createSupportTicketSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Выберите тему и напишите сообщение от 5 символов.', details: parsed.error.flatten() }, { status: 400 })
  }

  const ticket = await prisma.$transaction(async (tx) => {
    const created = await tx.supportTicket.create({
      data: {
        userId: session.uid,
        subject: supportCategorySubject(parsed.data.category),
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

  await createAdminNotification({
    type: 'support',
    severity: 'INFO',
    dedupeKey: `admin:support-ticket:${ticket.id}`,
    title: 'Новое обращение в поддержку',
    body: `${ticket.subject}: ${parsed.data.message.slice(0, 180)}`,
    entityType: 'supportTicket',
    entityId: ticket.id,
    actionHref: '/dashboard/admin/support',
    actionLabel: 'Открыть поддержку',
  })

  return NextResponse.json({
    ticket: {
      ...serializeSupportTicket(ticket),
      messages: ticket.messages.map(serializeSupportMessage),
    },
  }, { status: 201 })
})
