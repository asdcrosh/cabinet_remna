import { AdminPageShell } from '@/components/admin/admin-page-shell'
import { WatchDashboard } from '@/components/admin/watch-dashboard'
import { requireSuperAdminPage } from '@/lib/auth/admin-page'
import { getBrandName, getPageTitle } from '@/lib/branding'
import { getWatchReport } from '@/lib/watch-service'
import type { Metadata } from 'next'

export const dynamic = 'force-dynamic'

export function generateMetadata(): Metadata {
  return { title: getPageTitle('Watch') }
}

export default async function WatchPage() {
  await requireSuperAdminPage()
  const report = await getWatchReport()

  return (
    <AdminPageShell
      title={`${getBrandName()} Watch`}
      description="Живой контур нод, транспортов Reality и инцидентов"
    >
      <WatchDashboard initialReport={report} />
    </AdminPageShell>
  )
}
