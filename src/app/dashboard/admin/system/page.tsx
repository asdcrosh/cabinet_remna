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
import { SupportSettingsPanel } from '@/components/admin/support-settings-panel'
import { getSupportSettings } from '@/lib/support-settings'
import Link from 'next/link'
import { ArrowUpRight } from 'lucide-react'
import { SUPPORT_SETTINGS_HREF } from '@/lib/support-settings-access'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Настройки' }

export default async function AdminSystemPage() {
  await requireAdminPage()
  const [report, features, paymentSettings, branding, supportSettings] = await Promise.all([
    getSystemHealth(),
    getFeatureFlags(),
    getPublicPaymentProviderSettings(),
    getPublicBrandSettings(),
    getSupportSettings(),
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
        {
          id: 'support',
          title: 'Поддержка',
          description: 'SLA и шаблоны',
          badge: `${supportSettings.quickReplies.length} шаблонов`,
          keywords: ['поддержка', 'sla', 'ответы', 'шаблоны', 'операторы'],
          // Новый дизайн: шаблоны и SLA живут в самой Поддержке, здесь — короткая сводка и ссылка.
          // Если Поддержка выключена, редактировать больше негде — оставляем прежнюю форму.
          children: features.newDesign && features.support
            ? <SupportSettingsMovedNotice quickRepliesCount={supportSettings.quickReplies.length} />
            : <SupportSettingsPanel initialSettings={supportSettings} />,
        },
        {
          id: 'health',
          title: 'Состояние',
          description: 'Сервисы и процессы',
          badge: healthBadge,
          tone: errorCount > 0 ? 'danger' : warningCount > 0 ? 'warning' : 'success',
          keywords: ['диагностика', 'база данных', 'воркеры', 'обновления', 'бэкапы', 'remnawave', 'telegram'],
          children: <SystemHealthPanel initialReport={report} />,
        },
      ]} />
    </AdminPageShell>
  )
}

function SupportSettingsMovedNotice({ quickRepliesCount }: { quickRepliesCount: number }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-white/[0.025]">
      <h2 className="text-lg font-semibold">Шаблоны и SLA — в Поддержке</h2>
      <p className="mt-1 text-sm leading-6 text-slate-500">
        Шаблоны ответов ({quickRepliesCount}) и пороги ожидания ответа настраиваются прямо в разделе «Поддержка»:
        кнопкой «Шаблоны и SLA» в шапке или шестерёнкой рядом со списком шаблонов.
      </p>
      <Link href={SUPPORT_SETTINGS_HREF} className="btn-secondary mt-4 inline-flex">
        Открыть шаблоны и SLA
        <ArrowUpRight className="h-4 w-4" />
      </Link>
    </section>
  )
}
