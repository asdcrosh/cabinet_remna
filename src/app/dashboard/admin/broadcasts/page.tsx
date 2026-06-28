import { requireAdminPage } from '@/lib/auth/admin-page'
import { BroadcastAdmin } from '@/components/admin/broadcast-admin'
import { prisma } from '@/lib/prisma'

export const metadata = { title: 'Рассылки — Админка' }

export default async function BroadcastsPage() {
  await requireAdminPage()
  const history = await prisma.broadcastCampaign.findMany({
    orderBy: { createdAt: 'desc' },
    take: 12,
    select: {
      id: true,
      title: true,
      body: true,
      segment: true,
      channels: true,
      actionHref: true,
      actionLabel: true,
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
  })
  const templates = await prisma.broadcastTemplate.findMany({
    orderBy: { createdAt: 'desc' },
    take: 50,
  })

  return (
    <div className="space-y-5">
      <header className="card p-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Администрирование</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Рассылки</h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-500 dark:text-slate-400">
          Отправляйте сообщения выбранному сегменту через кабинет, Telegram и email.
        </p>
      </header>

      <BroadcastAdmin
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
    </div>
  )
}
