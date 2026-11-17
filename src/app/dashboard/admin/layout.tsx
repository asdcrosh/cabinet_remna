import { requireStaffPage } from '@/lib/auth/admin-page'
import { getFeatureFlags } from '@/lib/feature-flags'
import { AdminSectionTabsV2 } from '@/components/dashboard/dashboard-nav-v2'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requireStaffPage()
  const features = await getFeatureFlags()
  if (!features.newDesign) return children

  return (
    <>
      <AdminSectionTabsV2 role={user.role} features={features} />
      {children}
    </>
  )
}
