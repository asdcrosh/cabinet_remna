import { notFound, redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth/cookies'
import { serializeSupportMessage, serializeSupportTicket } from '@/lib/support'
import { SupportPanelDynamic } from '@/components/support/support-panel-dynamic'
import { isFeatureEnabled } from '@/lib/feature-flags'
import { formatPrice } from '@/lib/format'
import { paymentProviderLabel } from '@/lib/payment-provider-label'
import { supportCategories, type SupportCategoryValue } from '@/lib/support'
import { supportAttachmentSelect } from '@/lib/support-attachments'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Поддержка' }

export default async function SupportPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; payment?: string }>
}) {
  if (!await isFeatureEnabled('support')) notFound()
  const session = await getCurrentUser()
  if (!session) redirect('/login?next=/dashboard/support')
  const params = await searchParams
  const category = supportCategories.some((item) => item.value === params.category)
    ? params.category as SupportCategoryValue
    : 'connection'
  const paymentId = params.payment?.trim().slice(0, 100) || null

  const [tickets, payment] = await Promise.all([
    prisma.supportTicket.findMany({
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
            attachments: { select: supportAttachmentSelect },
          },
        },
      },
    }),
    paymentId
      ? prisma.payment.findFirst({
          where: { id: paymentId, userId: session.uid },
          select: {
            id: true,
            status: true,
            amountKopecks: true,
            provider: true,
            createdAt: true,
            plan: { select: { name: true } },
          },
        })
      : null,
  ])

  const initialMessage = payment
    ? [
        `Нужна помощь с платежом ${payment.id}.`,
        `Тариф: ${payment.plan.name}.`,
        `Сумма: ${formatPrice(payment.amountKopecks)}.`,
        `Способ оплаты: ${paymentProviderLabel(payment.provider)}.`,
        `Статус: ${paymentStatusLabel(payment.status)}.`,
        `Дата: ${payment.createdAt.toLocaleString('ru-RU')}.`,
        '',
        'Что произошло: ',
      ].join('\n')
    : ''

  return (
    <div>
      <SupportPanelDynamic
        mode="user"
        initialTickets={tickets.map((ticket) => ({
          ...serializeSupportTicket(ticket),
          messages: ticket.messages.map(serializeSupportMessage),
        }))}
        initialCategory={payment ? 'payment' : category}
        initialMessage={initialMessage}
        initialNewTicketOpen={Boolean(payment || params.category)}
      />
    </div>
  )
}

function paymentStatusLabel(status: string) {
  const labels: Record<string, string> = {
    PENDING: 'ожидает оплаты',
    SUCCEEDED: 'оплачен',
    CANCELED: 'отменён',
    REFUNDED: 'возвращён',
  }
  return labels[status] ?? status
}
