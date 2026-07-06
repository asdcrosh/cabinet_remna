import { requireAdminPage } from '@/lib/auth/admin-page'
import { BroadcastAdminDynamic } from '@/components/admin/broadcast-admin-dynamic'
import { AdminPageShell } from '@/components/admin/admin-page-shell'
import { prisma } from '@/lib/prisma'

export const metadata = { title: 'Рассылки — Админка' }

export default async function BroadcastsPage() {
  await requireAdminPage()
  const [historyTotal, history, templates] = await prisma.$transaction([
    prisma.broadcastCampaign.count(),
    prisma.broadcastCampaign.findMany({
      orderBy: { createdAt: 'desc' },
      take: 12,
      select: {
        id: true,
        title: true,
        body: true,
        segment: true,
        inactiveDays: true,
        channels: true,
        actionHref: true,
        actionLabel: true,
        actionOpenInTelegram: true,
        imageUrl: true,
        recipients: true,
        inAppCount: true,
        telegramSent: true,
        telegramSkipped: true,
        telegramDuplicate: true,
        telegramFailed: true,
        emailSent: true,
        emailSkipped: true,
        emailDuplicate: true,
        emailFailed: true,
        limited: true,
        createdAt: true,
        createdBy: { select: { email: true, name: true } },
      },
    }),
    prisma.broadcastTemplate.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
  ])

  return (
    <AdminPageShell
      title="Рассылки"
      description="Отправляйте сообщения выбранному сегменту через кабинет, Telegram и email."
    >
      <BroadcastAdminDynamic
        initialHistoryTotal={historyTotal}
        initialHistory={history.map((item) => ({
          ...item,
          createdAt: item.createdAt.toISOString(),
          createdBy: item.createdBy ? item.createdBy.name || item.createdBy.email : null,
        }))}
        initialTemplates={templates.map((template) => ({
          ...template,
          createdAt: template.createdAt.toISOString(),
          updatedAt: template.updatedAt.toISOString(),
        }))}
      />
    </AdminPageShell>
  )
}
