import { PageHeader } from '@/components/dashboard/page-header'
import { RemnashopSyncPanel } from '@/components/admin/remnashop-sync-panel'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Remnashop sync — Админка' }

export default function AdminRemnashopSyncPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Remnashop sync"
        description="Безопасная проверка импорта пользователей, подписок, тарифов и платежей из remnashop"
      />
      <RemnashopSyncPanel />
    </div>
  )
}
