import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowRight, BadgeCheck, Bell, BookOpen, CircleAlert, CircleUserRound, Gift, Link2, LockKeyhole, MailPlus, ReceiptText } from 'lucide-react'
import { getCurrentUser } from '@/lib/auth/cookies'
import { prisma } from '@/lib/prisma'
import { ChangePasswordForm } from '@/components/dashboard/change-password-form'
import { ProfileForm } from '@/components/dashboard/profile-form'
import { SettingsTabs } from '@/components/dashboard/settings-tabs'
import { TelegramLinkCard } from '@/components/dashboard/telegram-link-card'
import { PageHeader } from '@/components/dashboard/page-header'
import { LogoutButton } from '@/components/dashboard/logout-button'
import { getFeatureFlags } from '@/lib/feature-flags'
import { legalNavigation } from '@/lib/legal-links'
import { getNotificationPreferences } from '@/lib/notification-preferences'
import { NotificationPreferencesPanel } from '@/components/dashboard/notification-preferences-panel'
import { AutoRenewalCard } from '@/components/dashboard/auto-renewal-card'
import { calculateAutoRenewalPurchase, getAutoRenewalState } from '@/lib/auto-renewal'
import { getRetentionState } from '@/lib/subscription-retention'
import { calculatePersonalDiscount } from '@/lib/user-discounts'

export const dynamic = 'force-dynamic'

export default async function SettingsPage() {
  const telegramClientId = process.env.TELEGRAM_CLIENT_ID?.trim() || null
  const appUrl = process.env.APP_URL?.trim() || null
  const session = await getCurrentUser()
  if (!session) redirect('/login')
  const user = await prisma.user.findUnique({ where: { id: session.uid } })
  if (!user) redirect('/login')
  const [features, notificationPreferences, currentSubscription, autoRenewal, retentionPause] = await Promise.all([
    getFeatureFlags(),
    getNotificationPreferences(user.id),
    prisma.subscription.findFirst({
      where: { userId: user.id, status: { in: ['ACTIVE', 'LIMITED', 'PAUSED'] }, planId: { not: null } },
      orderBy: { expireAt: 'desc' },
      include: {
        plan: {
          select: {
            id: true,
            name: true,
            priceKopecks: true,
            durationDays: true,
            unlimitedDuration: true,
            deviceLimit: true,
            maxDeviceLimit: true,
            extraDevicePriceKopecks: true,
          },
        },
      },
    }),
    getAutoRenewalState(user.id),
    getRetentionState(user.id),
  ])
  const hasVerifiedEmail = Boolean(user.emailVerifiedAt && !user.email.endsWith('@pending.invalid'))
  const hasTelegram = Boolean(user.telegramId)
  const hasRemnashop = Boolean(user.remnashopUserId)
  const hasVpnProfile = Boolean(user.remnawaveId || user.remnawaveUuid || user.remnawaveUsername)
  const accountLinks = [
    { href: '/dashboard/billing', label: 'Покупки', description: 'Платежи и чеки', icon: ReceiptText, visible: true },
    { href: '/dashboard/referrals', label: 'Приглашения', description: 'Ссылка и вознаграждения', icon: Gift, visible: features.referrals },
  ].filter((item) => item.visible)

  return (
    <div className="user-workspace mx-auto max-w-7xl page-stack">
      <PageHeader
        title="Настройки"
        description="Управляйте профилем, входом и уведомлениями в одном месте."
      />

      <SettingsTabs
        sections={[
          {
            id: 'account',
            title: 'Профиль',
            shortTitle: 'Профиль',
            description: 'Имя и состояние аккаунта',
            children: (
              <SettingsSection
                id="account"
                title="Личные данные"
                description="То, как вас видит кабинет"
                icon={<CircleUserRound className="h-5 w-5" />}
              >
                <div className="grid gap-5 min-[1180px]:grid-cols-[minmax(0,1fr)_18rem]">
                  <div className="min-w-0">
                    <ProfileForm name={user.name} />
                  </div>
                  <div className="rounded-xl bg-slate-50 p-3.5 dark:bg-white/[0.03]">
                    <h3 className="text-sm font-semibold text-slate-950 dark:text-white">Состояние аккаунта</h3>
                    <p className="mt-0.5 text-xs leading-5 text-slate-500 dark:text-slate-400">Подключённые способы входа и профиль VPN.</p>
                    <div className="mt-3 divide-y divide-slate-200 dark:divide-white/[0.08]">
                      <AccountFact label="Email" value={hasVerifiedEmail ? 'Подтверждён' : 'Нужно подтвердить'} state={hasVerifiedEmail ? 'ready' : 'attention'} />
                      <AccountFact label="Telegram" value={hasTelegram ? 'Подключён' : 'Не подключён'} state={hasTelegram ? 'ready' : 'neutral'} />
                      <AccountFact label="Старые покупки" value={hasRemnashop ? 'Найдены' : 'Не найдены'} state={hasRemnashop ? 'ready' : 'neutral'} />
                      <AccountFact
                        label="Профиль VPN"
                        value={hasVpnProfile ? 'Готов' : 'Создастся при покупке'}
                        state={hasVpnProfile ? 'ready' : 'neutral'}
                      />
                    </div>
                  </div>
                </div>
              </SettingsSection>
            ),
          },
          {
            id: 'auto-renewal',
            title: 'Автопродление',
            shortTitle: 'Оплата',
            description: 'Регулярные списания',
            children: currentSubscription?.plan && !currentSubscription.plan.unlimitedDuration ? (
              <div className="space-y-3">
                <AutoRenewalCard
                  planId={currentSubscription.plan.id}
                  planName={currentSubscription.plan.name}
                  planPriceKopecks={currentRenewalPrice(
                    currentSubscription.plan,
                    currentSubscription.deviceLimit ?? currentSubscription.plan.deviceLimit,
                    user.personalDiscountPercent
                  )}
                  planDurationDays={currentSubscription.plan.durationDays}
                  planDeviceLimit={currentSubscription.deviceLimit ?? currentSubscription.plan.deviceLimit}
                  initialState={autoRenewal ? {
                    ...autoRenewal,
                    paymentMethodSavedAt: autoRenewal.paymentMethodSavedAt?.toISOString() ?? null,
                    consentAcceptedAt: autoRenewal.consentAcceptedAt?.toISOString() ?? null,
                    nextChargeAt: autoRenewal.nextChargeAt?.toISOString() ?? null,
                    lastAttemptAt: autoRenewal.lastAttemptAt?.toISOString() ?? null,
                    lastSuccessAt: autoRenewal.lastSuccessAt?.toISOString() ?? null,
                  } : null}
                  initialPause={retentionPause ? {
                    ...retentionPause,
                    pauseUntil: retentionPause.pauseUntil?.toISOString() ?? null,
                    createdAt: retentionPause.createdAt.toISOString(),
                  } : null}
                />
                <AutoRenewalExplanation />
              </div>
            ) : (
              <SettingsSection
                id="auto-renewal"
                title="Автопродление"
                description="Станет доступно после покупки обычного тарифа"
                icon={<ReceiptText className="h-5 w-5" />}
              >
                <div className="space-y-4">
                  <AutoRenewalExplanation />
                  <Link href="/dashboard/plans" className="btn-primary">Выбрать тариф</Link>
                </div>
              </SettingsSection>
            ),
          },
          {
            id: 'notifications',
            title: 'Уведомления',
            shortTitle: 'Уведомления',
            description: 'Куда присылать события',
            children: (
              <SettingsSection
                id="notifications"
                title="Уведомления"
                description="Выберите нужные каналы и отключите необязательные сообщения"
                icon={<Bell className="h-5 w-5" />}
              >
                <NotificationPreferencesPanel initialPreferences={notificationPreferences} />
              </SettingsSection>
            ),
          },
          {
            id: 'sync',
            title: 'Способы входа',
            shortTitle: 'Вход',
            description: 'Telegram и email',
            children: (
              <SettingsSection
                id="sync"
                title="Вход в кабинет"
                description="Подключите удобные способы входа и перенесите старые покупки"
                icon={<Link2 className="h-5 w-5" />}
              >
                <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_19rem]">
                  <div className="rounded-xl border border-slate-200 p-4 dark:border-white/[0.08]">
                    <TelegramLinkCard
                      telegramClientId={telegramClientId}
                      appUrl={appUrl}
                      telegramId={user.telegramId?.toString() ?? null}
                      telegramUsername={user.telegramUsername}
                      remnashopUserId={user.remnashopUserId}
                      remnawaveUsername={user.remnawaveUsername}
                      embedded
                    />
                  </div>
                  <div className="flex flex-col rounded-xl border border-slate-200 p-4 dark:border-white/[0.08]">
                    <div className="flex items-center gap-3">
                      <MailPlus className="h-5 w-5 shrink-0 text-cyan-600 dark:text-cyan-300" />
                      <div className="min-w-0">
                        <h3 className="font-semibold text-slate-950 dark:text-white">Email</h3>
                        <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
                          {hasVerifiedEmail ? 'Email подтверждён' : 'Добавьте email для входа'}
                        </p>
                      </div>
                    </div>
                    {!hasVerifiedEmail && user.telegramId ? (
                      <Link href="/telegram-email" className="btn-primary mt-4 w-full justify-center">
                        Добавить email
                      </Link>
                    ) : (
                      <div className={`mt-4 flex items-start gap-2 border-l-2 px-3 py-1.5 text-sm ${hasVerifiedEmail ? 'border-emerald-400 text-emerald-800 dark:text-emerald-100' : 'border-amber-400 text-amber-900 dark:text-amber-100'}`}>
                        {hasVerifiedEmail ? <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0" /> : <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />}
                        <span className="min-w-0 break-all">{hasVerifiedEmail ? user.email : 'Сначала привяжите Telegram.'}</span>
                      </div>
                    )}
                  </div>
                </div>
              </SettingsSection>
            ),
          },
          {
            id: 'security',
            title: 'Безопасность',
            shortTitle: 'Пароль',
            description: 'Пароль и защита входа',
            children: (
              <SettingsSection
                id="security"
                title="Безопасность"
                description="Смена пароля для входа по email"
                icon={<LockKeyhole className="h-5 w-5" />}
              >
                {hasVerifiedEmail ? (
                  <ChangePasswordForm />
                ) : (
                  <div className="border-l-2 border-amber-400 px-3 py-1.5 text-sm text-amber-900 dark:text-amber-100">
                    Добавьте и подтвердите email, чтобы включить вход по паролю.
                  </div>
                )}
              </SettingsSection>
            ),
          },
        ]}
      />

      <section aria-labelledby="account-links-title">
        <div className="mb-3">
          <h2 id="account-links-title" className="text-sm font-semibold text-slate-950 dark:text-white">Ещё в кабинете</h2>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">Покупки, чеки и приглашения находятся в отдельных разделах.</p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {accountLinks.map((item) => {
            const Icon = item.icon
            return (
              <Link key={item.href} href={item.href} className="group flex min-w-0 items-center gap-3 rounded-xl border border-slate-200 bg-white p-3.5 transition-colors hover:border-brand-200 hover:bg-brand-50/50 dark:border-white/[0.08] dark:bg-white/[0.025] dark:hover:border-brand-400/20 dark:hover:bg-brand-400/[0.06]">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300"><Icon className="h-4 w-4" /></span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-slate-950 dark:text-white">{item.label}</span>
                  <span className="block truncate text-xs text-slate-500 dark:text-slate-400">{item.description}</span>
                </span>
                <ArrowRight className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5" />
              </Link>
            )
          })}
        </div>
      </section>

      <div className="grid gap-3 border-t border-slate-200 pt-4 dark:border-white/10 sm:grid-cols-[minmax(0,1fr)_10rem] sm:items-start">
        <section aria-labelledby="legal-title">
          <div className="mb-2 flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-slate-400" />
            <h2 id="legal-title" className="text-sm font-semibold text-slate-950 dark:text-white">Документы</h2>
          </div>
          <nav className="flex flex-wrap gap-x-4 gap-y-2" aria-label="Правовая информация">
            {legalNavigation.map((item) => (
              <Link key={item.href} href={item.href} className="text-xs font-medium text-slate-500 hover:text-slate-950 dark:text-slate-400 dark:hover:text-white">
                {item.label}
              </Link>
            ))}
          </nav>
        </section>

        <section className="overflow-hidden rounded-xl border border-slate-200 dark:border-white/10" aria-label="Выход из аккаунта">
          <LogoutButton />
        </section>
      </div>
    </div>
  )
}

function AutoRenewalExplanation() {
  return (
    <div className="grid gap-2 sm:grid-cols-2" aria-label="Подключение и отключение автопродления">
      <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3.5 dark:border-emerald-400/20 dark:bg-emerald-400/[0.05]">
        <div className="flex items-center gap-2 text-sm font-semibold text-emerald-900 dark:text-emerald-100">
          <BadgeCheck className="h-4 w-4 shrink-0" /> Подключение только с согласия
        </div>
        <p className="mt-1.5 text-xs leading-5 text-emerald-900/75 dark:text-emerald-100/70">
          Включается отдельной кнопкой. До оплаты показываем сумму, периодичность и условия регулярных списаний.
        </p>
      </div>
      <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 dark:border-white/[0.09] dark:bg-white/[0.03]">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
          <CircleAlert className="h-4 w-4 shrink-0 text-slate-500" /> Отключение без поддержки
        </div>
        <p className="mt-1.5 text-xs leading-5 text-slate-600 dark:text-slate-300">
          Нажмите «Отключить» в этой вкладке. Новых списаний не будет, а уже оплаченный доступ сохранится.
        </p>
      </div>
    </div>
  )
}

function currentRenewalPrice(
  plan: {
    priceKopecks: number
    deviceLimit: number
    maxDeviceLimit: number
    extraDevicePriceKopecks: number
  },
  deviceLimit: number,
  personalDiscountPercent: number
) {
  try {
    const originalAmountKopecks = calculateAutoRenewalPurchase(plan, deviceLimit).originalAmountKopecks
    const personalDiscount = calculatePersonalDiscount(plan.priceKopecks, personalDiscountPercent)
    return originalAmountKopecks - (personalDiscount?.discountKopecks ?? 0)
  } catch {
    return plan.priceKopecks
  }
}

function SettingsSection({
  id,
  title,
  description,
  icon,
  children,
  className,
}: {
  id: string
  title: string
  description: string
  icon: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <section
      id={id}
      className={`settings-section scroll-mt-20 overflow-hidden border border-slate-200 bg-white dark:border-white/[0.09] dark:bg-white/[0.025] ${className ?? ''}`}
    >
      <div className="flex min-w-0 items-center gap-3 border-b border-slate-200 bg-slate-50/60 px-4 py-3.5 dark:border-white/[0.08] dark:bg-white/[0.02] sm:px-5">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300">{icon}</span>
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-slate-950 dark:text-white">{title}</h2>
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{description}</p>
        </div>
      </div>
      <div className="p-4 sm:p-5">{children}</div>
    </section>
  )
}

function AccountFact({
  label,
  value,
  state,
}: {
  label: string
  value: string
  state: 'ready' | 'attention' | 'neutral'
}) {
  const stateClass = state === 'ready'
    ? 'text-emerald-700 dark:text-emerald-300'
    : state === 'attention'
      ? 'text-amber-700 dark:text-amber-300'
      : 'text-slate-500 dark:text-slate-400'
  const dotClass = state === 'ready' ? 'bg-emerald-500' : state === 'attention' ? 'bg-amber-500' : 'bg-slate-400'

  return (
    <div className="flex min-w-0 items-center justify-between gap-3 py-2.5">
      <div className="min-w-0 text-sm text-slate-600 dark:text-slate-300">{label}</div>
      <div className={`flex min-w-0 items-center gap-1.5 text-right text-xs font-semibold ${stateClass}`} title={value}>
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dotClass}`} />
        <span className="truncate">{value}</span>
      </div>
    </div>
  )
}
