import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth/cookies'
import { serializeSupportMessage, serializeSupportTicket } from '@/lib/support'
import { PageHeader } from '@/components/dashboard/page-header'
import { SupportPanel } from '@/components/support/support-panel'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Поддержка' }

export default async function SupportPage() {
  const session = await getCurrentUser()
  if (!session) redirect('/login?next=/dashboard/support')

  const tickets = await prisma.supportTicket.findMany({
    where: { userId: session.uid },
    orderBy: { lastMessageAt: 'desc' },
    take: 50,
    include: {
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

  return (
    <div className="space-y-6">
      <PageHeader title="Поддержка" description="Вопросы по оплате, подключению и подписке" />
      <SupportPanel
        mode="user"
        initialTickets={tickets.map((ticket) => ({
          ...serializeSupportTicket(ticket),
          messages: ticket.messages.map(serializeSupportMessage),
        }))}
      />
    </div>
  )
}
