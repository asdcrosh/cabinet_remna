import Link from 'next/link'
import { Search } from 'lucide-react'
import { prisma } from '@/lib/prisma'
import { requireStaffPage } from '@/lib/auth/admin-page'
import { serializeSupportMessage, serializeSupportTicket, supportStatusLabel } from '@/lib/support'
import { PageHeader } from '@/components/dashboard/page-header'
import { SupportPanel } from '@/components/support/support-panel'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Поддержка — Админка' }

const statuses = [
  { value: 'ALL', label: 'Все' },
  { value: 'WAITING_ADMIN', label: 'Нужно ответить' },
  { value: 'WAITING_USER', label: 'Ответили' },
  { value: 'OPEN', label: 'Открытые' },
  { value: 'CLOSED', label: 'Закрытые' },
]

export default async function AdminSupportPage({
  searchParams,
}: {
  searchParams?: { status?: string; q?: string }
}) {
  await requireStaffPage()

  const status = searchParams?.status || 'ALL'
  const q = searchParams?.q?.trim() ?? ''
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

  const [tickets, waitingCount] = await prisma.$transaction([
    prisma.supportTicket.findMany({
      where,
      orderBy: [{ adminUnreadCount: 'desc' }, { lastMessageAt: 'desc' }],
      take: 50,
      include: {
        user: { select: { id: true, email: true, name: true, remnawaveUsername: true } },
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
    }),
    prisma.supportTicket.count({ where: { status: 'WAITING_ADMIN' } }),
  ])

  return (
    <div className="space-y-6">
      <PageHeader
        title="Поддержка"
        description="Очередь обращений пользователей"
        action={waitingCount > 0 ? <span className="badge-limited">{waitingCount} ждут ответа</span> : <span className="badge-active">Очередь чистая</span>}
      />

      <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-surface-900 lg:flex-row lg:items-center lg:justify-between">
        <form className="grid min-w-0 flex-1 gap-2 sm:grid-cols-[minmax(0,1fr)_12rem_auto_auto]" action="/dashboard/admin/support">
          <div className="relative min-w-0">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input name="q" defaultValue={q} placeholder="Тема, email или имя" className="input pl-9" />
          </div>
          <select name="status" defaultValue={status} className="input">
            {statuses.map((item) => (
              <option key={item.value} value={item.value}>{item.label}</option>
            ))}
          </select>
          <button className="btn-primary" type="submit">Найти</button>
          {(q || status !== 'ALL') && <Link href="/dashboard/admin/support" className="btn-secondary">Сбросить</Link>}
        </form>
        <div className="text-sm text-slate-500">
          {tickets.length} показано · {status === 'ALL' ? 'Все статусы' : supportStatusLabel(status)}
        </div>
      </div>

      <SupportPanel
        mode="admin"
        initialTickets={tickets.map((ticket) => ({
          ...serializeSupportTicket(ticket),
          messages: ticket.messages.map(serializeSupportMessage),
        }))}
      />
    </div>
  )
}
