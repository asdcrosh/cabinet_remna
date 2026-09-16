import { prisma } from '@/lib/prisma'
import { requireStaffPage } from '@/lib/auth/admin-page'
import { serializeSupportMessage, serializeSupportTicket } from '@/lib/support'
import { SupportPanelDynamic } from '@/components/support/support-panel-dynamic'
import { supportAttachmentSelect } from '@/lib/support-attachments'
import { parseAdminListLimit } from '@/lib/admin-list'
import { AdminPageShell } from '@/components/admin/admin-page-shell'
import { notFound } from 'next/navigation'
import { isFeatureEnabled } from '@/lib/feature-flags'
import {
  buildAdminSupportFolderWhere,
  buildAdminSupportOrderBy,
  buildAdminSupportSearchWhere,
  parseAdminSupportFolder,
} from '@/lib/admin-support-query'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Поддержка — Админка' }

export default async function AdminSupportPage({
  searchParams,
}: {
  searchParams: Promise<{ folder?: string; q?: string; limit?: string }>
}) {
  if (!await isFeatureEnabled('support')) notFound()
  await requireStaffPage()

  const params = await searchParams
  const folder = parseAdminSupportFolder(params.folder)
  const q = params.q?.trim() ?? ''
  const limit = parseAdminListLimit(params.limit)
  const searchWhere = buildAdminSupportSearchWhere(q)
  const where = { AND: [searchWhere, buildAdminSupportFolderWhere(folder)] }

  const [total, tickets, allCount, activeCount, needAnswerCount, answeredCount, closedCount] = await prisma.$transaction([
    prisma.supportTicket.count({ where }),
    prisma.supportTicket.findMany({
      where,
      orderBy: buildAdminSupportOrderBy(folder),
      take: limit,
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
          select: {
            id: true,
            body: true,
            senderRole: true,
            createdAt: true,
            sender: { select: { email: true, name: true } },
            attachments: { select: supportAttachmentSelect },
          },
        },
      },
    }),
    prisma.supportTicket.count({ where: searchWhere }),
    prisma.supportTicket.count({ where: { AND: [searchWhere, buildAdminSupportFolderWhere('active')] } }),
    prisma.supportTicket.count({ where: { AND: [searchWhere, buildAdminSupportFolderWhere('need-answer')] } }),
    prisma.supportTicket.count({ where: { AND: [searchWhere, buildAdminSupportFolderWhere('answered')] } }),
    prisma.supportTicket.count({ where: { AND: [searchWhere, buildAdminSupportFolderWhere('closed')] } }),
  ])

  return (
    <AdminPageShell title="Поддержка" description="Очередь обращений и переписка с пользователями">
      <SupportPanelDynamic
        mode="admin"
        initialTotal={total}
        pageSize={25}
        initialQuery={q}
        initialFolder={folder}
        initialCounts={{
          all: allCount,
          active: activeCount,
          'need-answer': needAnswerCount,
          answered: answeredCount,
          closed: closedCount,
        }}
        initialTickets={tickets.map((ticket) => ({
          ...serializeSupportTicket(ticket),
          messages: ticket.messages.map(serializeSupportMessage),
        }))}
      />
    </AdminPageShell>
  )
}
