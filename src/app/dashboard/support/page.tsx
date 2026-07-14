import { notFound, redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth/cookies'
import { serializeSupportMessage, serializeSupportTicket } from '@/lib/support'
import { SupportPanelDynamic } from '@/components/support/support-panel-dynamic'
import { isFeatureEnabled } from '@/lib/feature-flags'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Поддержка' }

export default async function SupportPage() {
  if (!isFeatureEnabled('support')) notFound()
  const session = await getCurrentUser()
  if (!session) redirect('/login?next=/dashboard/support')

  const tickets = await prisma.supportTicket.findMany({
    where: { userId: session.uid },
    orderBy: { lastMessageAt: 'desc' },
    take: 50,
    include: {
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
  })

  return (
    <div>
      <SupportPanelDynamic
        mode="user"
        initialTickets={tickets.map((ticket) => ({
          ...serializeSupportTicket(ticket),
          messages: ticket.messages.map(serializeSupportMessage),
        }))}
      />
    </div>
  )
}
