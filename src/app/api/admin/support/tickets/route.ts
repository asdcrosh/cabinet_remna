import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { requireStaff, withAuth } from '@/lib/auth/guard'
import { serializeSupportMessage, serializeSupportTicket } from '@/lib/support'
import { isFeatureEnabled } from '@/lib/feature-flags'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = withAuth(async (req: Request) => {
  if (!isFeatureEnabled('support')) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  await requireStaff()

  const url = new URL(req.url)
  const status = url.searchParams.get('status')
  const q = url.searchParams.get('q')?.trim()
  const page = Math.max(1, Number(url.searchParams.get('page') || '1') || 1)
  const cursor = parseSupportCursor(url.searchParams.get('cursor'))
  const pageSizeLimit = cursor ? 100 : 5000
  const pageSize = Math.min(pageSizeLimit, Math.max(1, Number(url.searchParams.get('pageSize') || '25') || 25))

  const baseWhere: Prisma.SupportTicketWhereInput = {
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
  const where: Prisma.SupportTicketWhereInput = cursor
    ? { AND: [baseWhere, { OR: buildSupportCursorWhere(cursor) }] }
    : baseWhere

  const [total, tickets] = await prisma.$transaction([
    prisma.supportTicket.count({ where: baseWhere }),
    prisma.supportTicket.findMany({
      where,
      orderBy: [{ adminUnreadCount: 'desc' }, { lastMessageAt: 'desc' }, { id: 'desc' }],
      take: pageSize + 1,
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
  const visibleTickets = tickets.slice(0, pageSize)
  const nextTicket = tickets[pageSize]

  return NextResponse.json({
    pagination: {
      page,
      pageSize,
      total,
      pageCount: Math.max(1, Math.ceil(total / pageSize)),
      nextCursor: nextTicket ? formatSupportCursor(nextTicket) : null,
    },
    tickets: visibleTickets.map((ticket) => ({
      ...serializeSupportTicket(ticket),
      messages: ticket.messages.map(serializeSupportMessage),
    })),
  })
})

type SupportCursor = {
  adminUnreadCount: number
  lastMessageAt: Date
  id: string
}

function parseSupportCursor(raw: string | null): SupportCursor | null {
  if (!raw) return null
  const [adminUnreadCountRaw, lastMessageAtRaw, id] = raw.split('|')
  const adminUnreadCount = Number(adminUnreadCountRaw)
  const lastMessageAt = new Date(lastMessageAtRaw || '')
  if (!Number.isInteger(adminUnreadCount) || !id || Number.isNaN(lastMessageAt.getTime())) return null
  return { adminUnreadCount, lastMessageAt, id }
}

function buildSupportCursorWhere(cursor: SupportCursor): Prisma.SupportTicketWhereInput[] {
  return [
    { adminUnreadCount: { lt: cursor.adminUnreadCount } },
    {
      adminUnreadCount: cursor.adminUnreadCount,
      lastMessageAt: { lt: cursor.lastMessageAt },
    },
    {
      adminUnreadCount: cursor.adminUnreadCount,
      lastMessageAt: cursor.lastMessageAt,
      id: { lt: cursor.id },
    },
  ]
}

function formatSupportCursor(ticket: { adminUnreadCount: number; lastMessageAt: Date; id: string }) {
  return `${ticket.adminUnreadCount}|${ticket.lastMessageAt.toISOString()}|${ticket.id}`
}
