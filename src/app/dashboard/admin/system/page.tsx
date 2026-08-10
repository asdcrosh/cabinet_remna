import { SystemHealthPanel } from '@/components/admin/system-health-panel'
import { AdminPageShell } from '@/components/admin/admin-page-shell'
import { requireAdminPage } from '@/lib/auth/admin-page'
import { getSystemHealth } from '@/lib/system-health'
import { getFeatureFlags } from '@/lib/feature-flags'
import { FeatureSettingsPanel } from '@/components/admin/feature-settings-panel'
import { PaymentProviderSettingsPanel } from '@/components/admin/payment-provider-settings-panel'
import { getPublicPaymentProviderSettings } from '@/lib/payment-settings'
import { BrandingSettingsPanel } from '@/components/admin/branding-settings-panel'
import { getPublicBrandSettings } from '@/lib/branding'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Состояние системы' }

export default async function AdminSystemPage() {
  await requireAdminPage()
  const [report, features, paymentSettings, branding] = await Promise.all([
    getSystemHealth(),
    getFeatureFlags(),
    getPublicPaymentProviderSettings(),
    getPublicBrandSettings(),
  ])

  return (
    <AdminPageShell
      title="Состояние системы"
      description="Платежи, синхронизация, фоновые процессы и инфраструктура"
    >
      <div className="space-y-8">
        <SystemHealthPanel initialReport={report} />
        <div className="border-t border-slate-200 pt-7 dark:border-white/10">
          <div className="mb-4 px-1">
            <h2 className="text-xl font-semibold tracking-tight">Настройки</h2>
            <p className="mt-1 text-sm text-slate-500">Оформление, функции кабинета и платёжные провайдеры</p>
          </div>
          <div className="space-y-5">
            <BrandingSettingsPanel initialSettings={branding} />
            <FeatureSettingsPanel initialFeatures={features} />
            <PaymentProviderSettingsPanel initialSettings={paymentSettings} />
          </div>
        </div>
      </div>
    </AdminPageShell>
  )
}
