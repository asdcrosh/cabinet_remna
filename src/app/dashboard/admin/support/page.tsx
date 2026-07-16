import { prisma } from '@/lib/prisma'
import { requireStaffPage } from '@/lib/auth/admin-page'
import { serializeSupportMessage, serializeSupportTicket } from '@/lib/support'
import { SupportPanelDynamic } from '@/components/support/support-panel-dynamic'
import { parseAdminListLimit } from '@/lib/admin-list'
import { PageHeader } from '@/components/dashboard/page-header'
import { notFound } from 'next/navigation'
import { isFeatureEnabled } from '@/lib/feature-flags'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Поддержка — Админка' }

export default async function AdminSupportPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; limit?: string }>
}) {
  if (!isFeatureEnabled('support')) notFound()
  await requireStaffPage()

  const params = await searchParams
  const status = params.status || 'ALL'
  const q = params.q?.trim() ?? ''
  const limit = parseAdminListLimit(params.limit)
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
    <div className="space-y-4">
      <PageHeader title="Поддержка" description="Обращения пользователей" />
      <SupportPanelDynamic
        mode="admin"
        initialTotal={total}
        pageSize={25}
        initialTickets={tickets.map((ticket) => ({
          ...serializeSupportTicket(ticket),
          messages: ticket.messages.map(serializeSupportMessage),
        }))}
      />
    </div>
  )
}
