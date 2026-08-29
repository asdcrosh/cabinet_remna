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
import { AdminSystemTabs } from '@/components/admin/admin-system-tabs'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Настройки' }

export default async function AdminSystemPage() {
  await requireAdminPage()
  const [report, features, paymentSettings, branding] = await Promise.all([
    getSystemHealth(),
    getFeatureFlags(),
    getPublicPaymentProviderSettings(),
    getPublicBrandSettings(),
  ])
  const errorCount = report.checks.filter((item) => item.status === 'error').length
  const warningCount = report.checks.filter((item) => item.status === 'warn').length
  const enabledFeatureCount = Object.values(features).filter(Boolean).length
  const configuredPaymentCount = [
    paymentSettings.yookassa,
    paymentSettings.payAnyWay,
    paymentSettings.platega,
  ].filter((provider) => provider.enabled && provider.configured).length
  const healthBadge = errorCount > 0
    ? `${errorCount} ошибок`
    : warningCount > 0
      ? `${warningCount} замечаний`
      : 'Всё работает'

  return (
    <AdminPageShell
      title="Настройки"
      description="Всё важное в одном месте, без длинной страницы"
      variant="plain"
    >
      <AdminSystemTabs tabs={[
        {
          id: 'health',
          title: 'Состояние',
          description: 'Сервисы и процессы',
          badge: healthBadge,
          tone: errorCount > 0 ? 'danger' : warningCount > 0 ? 'warning' : 'success',
          keywords: ['диагностика', 'база данных', 'воркеры', 'обновления', 'бэкапы', 'remnawave', 'telegram'],
          children: <SystemHealthPanel initialReport={report} />,
        },
        {
          id: 'branding',
          title: 'Оформление',
          description: 'Логотип и цвета',
          badge: branding.logoUrl ? 'Свой логотип' : 'Стандартный логотип',
          keywords: ['бренд', 'тема', 'акцент', 'светлая', 'тёмная', 'иконка'],
          children: <BrandingSettingsPanel initialSettings={branding} />,
        },
        {
          id: 'features',
          title: 'Функции',
          description: 'Разделы кабинета',
          badge: `${enabledFeatureCount} из 4 включено`,
          tone: 'success',
          keywords: ['рефералы', 'промокоды', 'бонусы', 'рулетка', 'разделы'],
          children: <FeatureSettingsPanel initialFeatures={features} />,
        },
        {
          id: 'payments',
          title: 'Платежи',
          description: 'Провайдеры оплаты',
          badge: `${configuredPaymentCount} из 3 готовы`,
          tone: configuredPaymentCount > 0 ? 'success' : 'warning',
          keywords: ['юкасса', 'yookassa', 'payanyway', 'platega', 'webhook', 'оплата'],
          children: <PaymentProviderSettingsPanel initialSettings={paymentSettings} />,
        },
      ]} />
    </AdminPageShell>
  )
}
