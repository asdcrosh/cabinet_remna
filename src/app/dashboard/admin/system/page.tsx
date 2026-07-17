import { SystemHealthPanel } from '@/components/admin/system-health-panel'
import { AdminPageShell } from '@/components/admin/admin-page-shell'
import { requireAdminPage } from '@/lib/auth/admin-page'
import { getSystemHealth } from '@/lib/system-health'
import { getFeatureFlags } from '@/lib/feature-flags'
import { FeatureSettingsPanel } from '@/components/admin/feature-settings-panel'
import { PaymentProviderSettingsPanel } from '@/components/admin/payment-provider-settings-panel'
import { getPublicPaymentProviderSettings } from '@/lib/payment-settings'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Система' }

export default async function AdminSystemPage() {
  await requireAdminPage()
  const [report, features, paymentSettings] = await Promise.all([
    getSystemHealth(),
    getFeatureFlags(),
    getPublicPaymentProviderSettings(),
  ])

  return (
    <AdminPageShell
      title="Система"
      description="Интеграции, бэкапы и состояние сервисов"
    >
      <div className="space-y-4">
        <FeatureSettingsPanel initialFeatures={features} />
        <PaymentProviderSettingsPanel initialSettings={paymentSettings} />
        <SystemHealthPanel initialReport={report} />
      </div>
    </AdminPageShell>
  )
}
