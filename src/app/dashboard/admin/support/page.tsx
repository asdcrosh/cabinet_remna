import { prisma } from '@/lib/prisma'
import { requireStaffPage } from '@/lib/auth/admin-page'
import { serializeSupportMessage, serializeSupportTicket } from '@/lib/support'
import { SupportPanel } from '@/components/support/support-panel'
import { parseAdminListLimit } from '@/lib/admin-list'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Поддержка — Админка' }

export default async function AdminSupportPage({
  searchParams,
}: {
  searchParams?: { status?: string; q?: string; limit?: string }
}) {
  await requireStaffPage()

  const status = searchParams?.status || 'ALL'
  const q = searchParams?.q?.trim() ?? ''
  const limit = parseAdminListLimit(searchParams?.limit)
  const where = {
    ...(status !== 'ALL' ? { status: status as any } : {}),
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
      take: limit,
      include: {
        user: { select: { id: true, email: true, name: true, remnawaveUsername: true } },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            id: true,
            body: true,
            senderRole: true,
            createdAt: true,
            sender: { select: { email: true, name: true } },
          },
        },
      },
    }),
  ])

  return (
    <SupportPanel
      mode="admin"
      initialTotal={total}
      pageSize={25}
      initialTickets={tickets.map((ticket) => ({
        ...serializeSupportTicket(ticket),
        messages: ticket.messages.map(serializeSupportMessage),
      }))}
    />
  )
}
