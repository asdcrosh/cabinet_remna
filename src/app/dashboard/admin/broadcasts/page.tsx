import { requireAdminPage } from '@/lib/auth/admin-page'
import { BroadcastAdmin } from '@/components/admin/broadcast-admin'

export const metadata = { title: 'Рассылки — Админка' }

export default async function BroadcastsPage() {
  await requireAdminPage()

  return (
    <div className="space-y-5">
      <header className="card p-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Администрирование</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Рассылки</h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-500 dark:text-slate-400">
          Отправляйте сообщения выбранному сегменту через кабинет, Telegram и email.
        </p>
      </header>

      <BroadcastAdmin />
    </div>
  )
}
