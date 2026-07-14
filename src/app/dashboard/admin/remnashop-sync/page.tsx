import { PageHeader } from '@/components/dashboard/page-header'
import { RemnashopSyncPanel } from '@/components/admin/remnashop-sync-panel'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Синхронизация — Админка' }

export default function AdminRemnashopSyncPage() {
  return (
    <div className="page-stack">
      <PageHeader
        title="Синхронизация"
        description="Перенос и обновление данных из Remnashop"
      />
      <RemnashopSyncPanel />
    </div>
  )
}
