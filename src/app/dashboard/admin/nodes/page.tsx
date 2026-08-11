import { NodeProvisioningPanel } from '@/components/admin/node-provisioning-panel'
import { AdminPageShell } from '@/components/admin/admin-page-shell'
import { requireSuperAdminPage } from '@/lib/auth/admin-page'
import { getPageTitle } from '@/lib/branding'

export const dynamic = 'force-dynamic'
export const metadata = { title: getPageTitle('Ноды') }

export default async function AdminNodesPage() {
  await requireSuperAdminPage()

  return (
    <AdminPageShell
      title="Ноды"
      description="Создание сервера, домена и подключения к Remnawave"
    >
      <NodeProvisioningPanel />
    </AdminPageShell>
  )
}
