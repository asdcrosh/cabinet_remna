import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowRight, Bell, BookOpen, CircleUserRound, Gift, LockKeyhole, ReceiptText, Send } from 'lucide-react'
import { getCurrentUser } from '@/lib/auth/cookies'
import { prisma } from '@/lib/prisma'
import { ChangePasswordForm } from '@/components/dashboard/change-password-form'
import { ProfileForm } from '@/components/dashboard/profile-form'
import { SettingsTabs, type SettingsTabId } from '@/components/dashboard/settings-tabs'
import { TelegramLinkCard } from '@/components/dashboard/telegram-link-card'
import { PageHeader } from '@/components/dashboard/page-header'
import { SessionSecurityPanel } from '@/components/dashboard/session-security-panel'
import { getFeatureFlags } from '@/lib/feature-flags'
import { legalNavigation } from '@/lib/legal-links'
import { getNotificationPreferences } from '@/lib/notification-preferences'
import { NotificationPreferencesPanel } from '@/components/dashboard/notification-preferences-panel'

export const dynamic = 'force-dynamic'

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ section?: string | string[] }>
}) {
  const telegramClientId = process.env.TELEGRAM_CLIENT_ID?.trim() || null
  const appUrl = process.env.APP_URL?.trim() || null
  const session = await getCurrentUser()
  if (!session) redirect('/login')
  const user = await prisma.user.findUnique({ where: { id: session.uid } })
  if (!user) redirect('/login')
  const [features, notificationPreferences, securityEvents, resolvedSearchParams] = await Promise.all([
    getFeatureFlags(),
    getNotificationPreferences(user.id),
    prisma.auditLog.findMany({
      where: {
        actorId: user.id,
        action: { in: ['USER_PASSWORD_CHANGED', 'USER_SESSIONS_REVOKED'] },
      },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: { id: true, action: true, createdAt: true, userAgent: true },
    }),
    searchParams,
  ])
  const hasVerifiedEmail = Boolean(user.emailVerifiedAt && !user.email.endsWith('@pending.invalid'))
  const hasTelegram = Boolean(user.telegramId)
  const hasRemnashop = Boolean(user.remnashopUserId)
  const hasVpnProfile = Boolean(user.remnawaveId || user.remnawaveUuid || user.remnawaveUsername)
  const requestedSection = Array.isArray(resolvedSearchParams.section) ? resolvedSearchParams.section[0] : resolvedSearchParams.section
  const initialSection: SettingsTabId = isSettingsSection(requestedSection) ? requestedSection : 'account'
  const accountLinks = [
    { href: '/dashboard/billing', label: 'Покупки', description: 'Платежи и их статусы', icon: ReceiptText, visible: true },
    { href: '/dashboard/referrals', label: 'Приглашения', description: 'Ссылка и вознаграждения', icon: Gift, visible: features.referrals },
    { href: '/dashboard/bonus-box', label: 'Бонусы', description: 'Доступные подарки и награды', icon: Gift, visible: features.bonusBox },
  ].filter((item) => item.visible)

  return (
    <div className="user-workspace mx-auto max-w-7xl page-stack">
      <PageHeader
        title="Настройки"
        description="Профиль, безопасность, Telegram и уведомления."
      />

      <SettingsTabs
        initialId={initialSection}
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
                      <AccountFact label="Старые покупки" value={hasRemnashop ? 'Найдены' : 'Не найдены'} state={hasRemnashop ? 'ready' : 'neutral'} />
                      <AccountFact
                        label="Профиль VPN"
                        value={hasVpnProfile ? 'Готов' : 'Создастся при покупке'}
                        state={hasVpnProfile ? 'ready' : 'neutral'}
                      />
                    </div>
                    {!hasVerifiedEmail && user.telegramId ? (
                      <Link href="/telegram-email" className="btn-secondary mt-3 w-full justify-center">
                        Добавить email
                      </Link>
                    ) : null}
                  </div>
                </div>
              </SettingsSection>
            ),
          },
          {
            id: 'security',
            title: 'Безопасность',
            shortTitle: 'Безопасность',
            description: 'Пароль и сеансы',
            children: (
              <SettingsSection
                id="security"
                title="Безопасность"
                description="Пароль и доступ к аккаунту"
                icon={<LockKeyhole className="h-5 w-5" />}
              >
                <div className="space-y-5">
                  {hasVerifiedEmail ? (
                    <ChangePasswordForm />
                  ) : (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-400/20 dark:bg-amber-400/[0.08] dark:text-amber-100">
                      Добавьте и подтвердите email, чтобы установить пароль.
                    </div>
                  )}
                  <SessionSecurityPanel
                    expiresAt={typeof session.exp === 'number' ? new Date(session.exp * 1000).toISOString() : null}
                    events={securityEvents.map((event) => ({
                      ...event,
                      action: event.action as 'USER_PASSWORD_CHANGED' | 'USER_SESSIONS_REVOKED',
                      createdAt: event.createdAt.toISOString(),
                    }))}
                  />
                </div>
              </SettingsSection>
            ),
          },
          {
            id: 'telegram',
            title: 'Telegram',
            shortTitle: 'Telegram',
            description: hasTelegram ? 'Аккаунт подключён' : 'Подключить аккаунт',
            children: (
              <SettingsSection
                id="telegram"
                title="Telegram"
                description="Вход и перенос старых покупок"
                icon={<Send className="h-5 w-5" />}
              >
                <TelegramLinkCard
                  telegramClientId={telegramClientId}
                  appUrl={appUrl}
                  telegramId={user.telegramId?.toString() ?? null}
                  telegramUsername={user.telegramUsername}
                  remnashopUserId={user.remnashopUserId}
                  remnawaveUsername={user.remnawaveUsername}
                  embedded
                />
              </SettingsSection>
            ),
          },
          {
            id: 'notifications',
            title: 'Уведомления',
            shortTitle: 'Уведомления',
            description: 'Каналы и рассылки',
            children: (
              <SettingsSection
                id="notifications"
                title="Уведомления"
                description="Выберите, куда присылать события"
                icon={<Bell className="h-5 w-5" />}
              >
                <NotificationPreferencesPanel initialPreferences={notificationPreferences} />
              </SettingsSection>
            ),
          },
        ]}
      />

      <section aria-labelledby="account-links-title">
        <div className="mb-3">
          <h2 id="account-links-title" className="text-sm font-semibold text-slate-950 dark:text-white">Ещё в кабинете</h2>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">Платежи, приглашения и бонусы.</p>
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

      <div className="border-t border-slate-200 pt-4 dark:border-white/10">
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
      </div>
    </div>
  )
}

function isSettingsSection(value: string | undefined): value is SettingsTabId {
  return value === 'account' || value === 'security' || value === 'telegram' || value === 'notifications'
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
