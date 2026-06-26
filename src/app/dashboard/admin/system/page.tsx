import { SystemHealthPanel } from '@/components/admin/system-health-panel'
import { requireAdminPage } from '@/lib/auth/admin-page'
import { getSystemHealth } from '@/lib/system-health'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Система' }

export default async function AdminSystemPage() {
  await requireAdminPage()
  const report = await getSystemHealth()

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Система</h1>
        <p className="mt-1 text-sm text-slate-500">
          Проверка боевых интеграций, бэкапов и готовности кабинета
        </p>
      </header>
      <SystemHealthPanel initialReport={report} />
    </div>
  )
}
