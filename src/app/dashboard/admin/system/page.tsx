import { SystemHealthPanel } from '@/components/admin/system-health-panel'
import { AdminPageShell } from '@/components/admin/admin-page-shell'
import { requireAdminPage } from '@/lib/auth/admin-page'
import { getSystemHealth } from '@/lib/system-health'
import { getFeatureFlags } from '@/lib/feature-flags'
import { FeatureSettingsPanel } from '@/components/admin/feature-settings-panel'
import { PaymentProviderSettingsPanel } from '@/components/admin/payment-provider-settings-panel'
import { getPublicPaymentProviderSettings } from '@/lib/payment-settings'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Состояние системы' }

export default async function AdminSystemPage() {
  await requireAdminPage()
  const [report, features, paymentSettings] = await Promise.all([
    getSystemHealth(),
    getFeatureFlags(),
    getPublicPaymentProviderSettings(),
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
            <p className="mt-1 text-sm text-slate-500">Функции кабинета и реквизиты платёжных провайдеров</p>
          </div>
          <div className="space-y-5">
            <FeatureSettingsPanel initialFeatures={features} />
            <PaymentProviderSettingsPanel initialSettings={paymentSettings} />
          </div>
        </div>
      </div>
    </AdminPageShell>
  )
}
