import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { requireStaff, withAuth } from '@/lib/auth/guard'
import { serializeSupportMessage, serializeSupportTicket } from '@/lib/support'
import { isFeatureEnabled } from '@/lib/feature-flags'
import { supportAttachmentSelect } from '@/lib/support-attachments'
import {
  buildAdminSupportFolderWhere,
  buildAdminSupportOrderBy,
  buildAdminSupportSearchWhere,
  parseAdminSupportFolder,
  type AdminSupportFolder,
} from '@/lib/admin-support-query'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = withAuth(async (req: Request) => {
  if (!await isFeatureEnabled('support')) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  await requireStaff()

  const url = new URL(req.url)
  const folder = parseAdminSupportFolder(url.searchParams.get('folder'))
  const q = url.searchParams.get('q')?.trim()
  const page = Math.max(1, Number(url.searchParams.get('page') || '1') || 1)
  const cursor = parseSupportCursor(url.searchParams.get('cursor'))
  const pageSizeLimit = cursor ? 100 : 5000
  const pageSize = Math.min(pageSizeLimit, Math.max(1, Number(url.searchParams.get('pageSize') || '25') || 25))

  const searchWhere = buildAdminSupportSearchWhere(q ?? '')
  const baseWhere: Prisma.SupportTicketWhereInput = {
    AND: [searchWhere, buildAdminSupportFolderWhere(folder)],
  }
  const where: Prisma.SupportTicketWhereInput = cursor
    ? { AND: [baseWhere, { OR: buildSupportCursorWhere(cursor, folder) }] }
    : baseWhere

  const [total, tickets, allCount, activeCount, needAnswerCount, answeredCount, closedCount] = await prisma.$transaction([
    prisma.supportTicket.count({ where: baseWhere }),
    prisma.supportTicket.findMany({
      where,
      orderBy: buildAdminSupportOrderBy(folder),
      take: pageSize + 1,
      include: {
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
          take: 1,
          select: { id: true, body: true, senderRole: true, createdAt: true, attachments: { select: supportAttachmentSelect } },
        },
      },
    }),
    prisma.supportTicket.count({ where: searchWhere }),
    prisma.supportTicket.count({ where: { AND: [searchWhere, buildAdminSupportFolderWhere('active')] } }),
    prisma.supportTicket.count({ where: { AND: [searchWhere, buildAdminSupportFolderWhere('need-answer')] } }),
    prisma.supportTicket.count({ where: { AND: [searchWhere, buildAdminSupportFolderWhere('answered')] } }),
    prisma.supportTicket.count({ where: { AND: [searchWhere, buildAdminSupportFolderWhere('closed')] } }),
  ])
  const visibleTickets = tickets.slice(0, pageSize)
  const hasMore = tickets.length > pageSize
  const lastVisibleTicket = visibleTickets.at(-1)

  return NextResponse.json({
    pagination: {
      page,
      pageSize,
      total,
      pageCount: Math.max(1, Math.ceil(total / pageSize)),
      nextCursor: hasMore && lastVisibleTicket
        ? formatSupportCursor(lastVisibleTicket)
        : null,
    },
    counts: {
      all: allCount,
      active: activeCount,
      'need-answer': needAnswerCount,
      answered: answeredCount,
      closed: closedCount,
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

function buildSupportCursorWhere(cursor: SupportCursor, folder: AdminSupportFolder): Prisma.SupportTicketWhereInput[] {
  if (folder === 'need-answer') {
    return [
      { lastMessageAt: { gt: cursor.lastMessageAt } },
      {
        lastMessageAt: cursor.lastMessageAt,
        id: { gt: cursor.id },
      },
    ]
  }
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
