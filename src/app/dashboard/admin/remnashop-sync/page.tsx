import { AdminPageShell } from '@/components/admin/admin-page-shell'
import { RemnashopSyncPanel } from '@/components/admin/remnashop-sync-panel'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Remnashop — Админка' }

export default function AdminRemnashopSyncPage() {
  return (
    <AdminPageShell
      title="Remnashop"
      description="Состояние интеграции и обмен данными"
    >
      <RemnashopSyncPanel />
    </AdminPageShell>
  )
}
