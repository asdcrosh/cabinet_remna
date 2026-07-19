import { AdminPageShell } from '@/components/admin/admin-page-shell'
import { RemnashopSyncPanel } from '@/components/admin/remnashop-sync-panel'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Синхронизация — Админка' }

export default function AdminRemnashopSyncPage() {
  return (
    <AdminPageShell
      title="Синхронизация"
      description="Перенос и обновление данных из Remnashop"
    >
      <RemnashopSyncPanel />
    </AdminPageShell>
  )
}
