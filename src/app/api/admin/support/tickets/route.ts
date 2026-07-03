import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireStaff, withAuth } from '@/lib/auth/guard'
import { serializeSupportMessage, serializeSupportTicket } from '@/lib/support'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = withAuth(async (req: Request) => {
  await requireStaff()

  const url = new URL(req.url)
  const status = url.searchParams.get('status')
  const q = url.searchParams.get('q')?.trim()
  const page = Math.max(1, Number(url.searchParams.get('page') || '1') || 1)
  const pageSize = Math.min(5000, Math.max(1, Number(url.searchParams.get('pageSize') || '25') || 25))
  const skip = (page - 1) * pageSize

  const where = {
    ...(status && status !== 'ALL' ? { status: status as any } : {}),
    ...(q
      ? {
          OR: [
            { subject: { contains: q, mode: 'insensitive' as const } },
            { user: { email: { contains: q, mode: 'insensitive' as const } } },
            { user: { name: { contains: q, mode: 'insensitive' as const } } },
          ],
        }
      : {}),
  }

  const [total, tickets] = await prisma.$transaction([
    prisma.supportTicket.count({ where }),
    prisma.supportTicket.findMany({
      where,
      orderBy: [{ adminUnreadCount: 'desc' }, { lastMessageAt: 'desc' }],
      skip,
      take: pageSize,
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
          take: 1,
          select: { id: true, body: true, senderRole: true, createdAt: true },
        },
      },
    }),
  ])

  return NextResponse.json({
    pagination: {
      page,
      pageSize,
      total,
      pageCount: Math.max(1, Math.ceil(total / pageSize)),
    },
    tickets: tickets.map((ticket) => ({
      ...serializeSupportTicket(ticket),
      messages: ticket.messages.map(serializeSupportMessage),
    })),
  })
})
