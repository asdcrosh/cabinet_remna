import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowUpRight, Bell, BookOpen, Check, ChevronRight, CircleUserRound, FileDown, Gift, LockKeyhole, Mail, ReceiptText, Send, Trash2 } from 'lucide-react'
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

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ section?: string | string[] }> }) {
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
        action: { in: ['USER_PASSWORD_CHANGED', 'USER_SESSIONS_REVOKED', 'ADMIN_PROFILE_UPDATED'] },
      },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: { id: true, action: true, message: true, createdAt: true, userAgent: true },
    }),
    searchParams,
  ])
  const hasEmail = !user.email.endsWith('@pending.invalid')
  const hasVerifiedEmail = Boolean(user.emailVerifiedAt && hasEmail)
  const hasTelegram = Boolean(user.telegramId)
  const requestedSection = Array.isArray(resolvedSearchParams.section) ? resolvedSearchParams.section[0] : resolvedSearchParams.section
  const initialSection: SettingsTabId = isSettingsSection(requestedSection) ? requestedSection : 'account'
  const displayName = user.name?.trim() || (hasEmail ? user.email.split('@')[0] || 'Ваш аккаунт' : 'Ваш аккаунт')
  const initial = Array.from(displayName)[0]?.toLocaleUpperCase('ru-RU') || 'А'
  const relatedLinks = [
    { href: '/dashboard/billing', label: 'Платежи и покупки', icon: ReceiptText, visible: true },
    { href: '/dashboard/referrals', label: 'Приглашения', icon: Gift, visible: features.referrals },
    { href: '/dashboard/bonus-box', label: 'Бонусы', icon: Gift, visible: features.bonusBox },
  ].filter((item) => item.visible)

  return (
    <div className="user-workspace mx-auto max-w-6xl space-y-4 pb-8 sm:space-y-6">
      <PageHeader title="Настройки" description="Профиль, доступ и уведомления." />

      <div className="relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 px-4 py-4 text-white sm:px-6 sm:py-6">
        <div className="absolute inset-y-0 left-0 w-1 bg-cyan-400" aria-hidden="true" />
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3 sm:gap-4">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-white/15 bg-white/10 text-lg font-semibold sm:h-16 sm:w-16 sm:rounded-2xl sm:text-xl">{initial}</div>
            <div className="min-w-0">
              <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-cyan-300">Ваш аккаунт</p>
              <p className="truncate text-lg font-semibold tracking-tight sm:mt-1 sm:text-2xl">{displayName}</p>
              <p className="truncate text-xs text-slate-300 sm:mt-1 sm:text-sm">{hasEmail ? user.email : 'Email пока не добавлен'}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1.5 pl-1 sm:max-w-64 sm:justify-end sm:gap-2 sm:pl-0">
            <span className={`inline-flex items-center gap-1.5 text-xs font-medium sm:rounded-full sm:border sm:px-3 sm:py-1.5 ${hasVerifiedEmail ? 'text-emerald-200 sm:border-emerald-400/25 sm:bg-emerald-400/10' : 'text-amber-200 sm:border-amber-400/25 sm:bg-amber-400/10'}`}>
              {hasVerifiedEmail ? <Check className="h-3.5 w-3.5" /> : <Mail className="h-3.5 w-3.5" />}
              {hasVerifiedEmail ? 'Email подтверждён' : 'Email не подтверждён'}
            </span>
            <span className={`inline-flex items-center gap-1.5 text-xs font-medium sm:rounded-full sm:border sm:px-3 sm:py-1.5 ${hasTelegram ? 'text-sky-200 sm:border-sky-400/25 sm:bg-sky-400/10' : 'text-slate-300 sm:border-white/15 sm:bg-white/5'}`}>
              <Send className="h-3.5 w-3.5" />
              {hasTelegram ? 'Telegram подключён' : 'Telegram не подключён'}
            </span>
          </div>
        </div>
      </div>

      <SettingsTabs
        initialId={initialSection}
        footer={
          <div className="space-y-0.5">
            <p className="px-3 pb-1 text-xs font-semibold uppercase tracking-[0.12em] text-slate-400 dark:text-slate-500">Другие разделы</p>
            {relatedLinks.map((item) => {
              const Icon = item.icon
              return (
                <Link key={item.href} href={item.href} className="group flex min-h-10 items-center gap-2.5 rounded-lg px-3 text-sm text-slate-600 hover:bg-slate-100 hover:text-slate-950 dark:text-slate-400 dark:hover:bg-white/[0.06] dark:hover:text-white">
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="flex-1">{item.label}</span>
                  <ArrowUpRight className="h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-100" />
                </Link>
              )
            })}
          </div>
        }
        sections={[
          {
            id: 'account', title: 'Профиль', description: 'Имя и email',
            children: (
              <SettingsSection id="account" title="Профиль" description="Личные данные и контактный адрес" icon={<CircleUserRound className="h-5 w-5" />}>
                <div className="max-w-2xl">
                  <ProfileForm name={user.name} />
                </div>
                <div className="mt-7 border-t border-slate-200 pt-6 dark:border-white/10">
                  <h3 className="text-sm font-semibold text-slate-950 dark:text-white">Контактный email</h3>
                  <p className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400">Используется для входа, восстановления доступа и важных писем.</p>
                  <div className="mt-4 flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3.5 dark:border-white/10 dark:bg-white/[0.035] sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="break-all text-sm font-medium text-slate-950 dark:text-white">{hasEmail ? user.email : 'Email не добавлен'}</p>
                      <p className={`mt-0.5 text-xs ${hasVerifiedEmail ? 'text-emerald-700 dark:text-emerald-300' : 'text-amber-700 dark:text-amber-300'}`}>
                        {hasVerifiedEmail ? 'Адрес подтверждён' : hasEmail ? 'Адрес ещё не подтверждён' : 'Добавьте адрес для восстановления доступа'}
                      </p>
                    </div>
                    {!hasVerifiedEmail && hasTelegram ? (
                      <Link href="/telegram-email" className="btn-secondary w-full shrink-0 sm:w-auto">
                        {hasEmail ? 'Подтвердить email' : 'Добавить email'}
                        <ChevronRight className="h-4 w-4" />
                      </Link>
                    ) : null}
                  </div>
                </div>
              </SettingsSection>
            ),
          },
          {
            id: 'security', title: 'Безопасность', description: 'Пароль и сеансы',
            children: (
              <SettingsSection id="security" title="Безопасность" description="Контролируйте доступ к кабинету" icon={<LockKeyhole className="h-5 w-5" />}>
                <h3 className="text-sm font-semibold text-slate-950 dark:text-white">Пароль</h3>
                <p className="mb-4 mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400">После смены пароля вход на других устройствах завершится.</p>
                {hasVerifiedEmail ? <ChangePasswordForm /> : (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-400/20 dark:bg-amber-400/[0.08] dark:text-amber-100">
                    Добавьте и подтвердите email, чтобы установить пароль.
                  </div>
                )}
                <div className="mt-7 border-t border-slate-200 pt-6 dark:border-white/10">
                  <SessionSecurityPanel
                    expiresAt={typeof session.exp === 'number' ? new Date(session.exp * 1000).toISOString() : null}
                    events={securityEvents.map((event) => ({
                      ...event,
                      action: event.action as 'USER_PASSWORD_CHANGED' | 'USER_SESSIONS_REVOKED' | 'ADMIN_PROFILE_UPDATED',
                      createdAt: event.createdAt.toISOString(),
                    }))}
                  />
                </div>
              </SettingsSection>
            ),
          },
          {
            id: 'telegram', title: 'Telegram', description: hasTelegram ? 'Аккаунт подключён' : 'Подключить аккаунт',
            children: (
              <SettingsSection id="telegram" title="Telegram" description="Вход, уведомления и старые покупки" icon={<Send className="h-5 w-5" />}>
                <TelegramLinkCard
                  telegramClientId={telegramClientId}
                  appUrl={appUrl}
                  telegramId={user.telegramId?.toString() ?? null}
                  telegramUsername={user.telegramUsername}
                  remnashopUserId={user.remnashopUserId}
                  remnawaveUsername={user.remnawaveUsername}
                />
              </SettingsSection>
            ),
          },
          {
            id: 'notifications', title: 'Уведомления', description: 'Каналы и новости',
            children: (
              <SettingsSection id="notifications" title="Уведомления" description="Выберите, где получать сообщения" icon={<Bell className="h-5 w-5" />}>
                <NotificationPreferencesPanel initialPreferences={notificationPreferences} hasVerifiedEmail={hasVerifiedEmail} hasTelegram={hasTelegram} />
              </SettingsSection>
            ),
          },
          {
            id: 'data', title: 'Данные', description: features.support ? 'Экспорт и документы' : 'Документы',
            children: (
              <SettingsSection id="data" title="Данные аккаунта" description="Ваши данные и правовая информация" icon={<BookOpen className="h-5 w-5" />}>
                {features.support ? (
                  <div>
                    <h3 className="text-sm font-semibold text-slate-950 dark:text-white">Запросы о данных</h3>
                    <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500 dark:text-slate-400">
                      Экспорт и удаление оформляются через поддержку. Там можно подтвердить личность и отслеживать ответ.
                      При удалении персональные данные удаляются или обезличиваются, а платёжные сведения сохраняются в обязательный по закону срок.
                    </p>
                    <div className="mt-4 space-y-2">
                      <DataAction href="/dashboard/support?category=account&request=export" icon={<FileDown className="h-5 w-5" />} title="Запросить копию данных" description="Создать обращение об экспорте" />
                      <DataAction href="/dashboard/support?category=account&request=delete" icon={<Trash2 className="h-5 w-5" />} title="Запросить удаление аккаунта" description="Создать обращение и узнать, какие данные сохраняются по закону" danger />
                    </div>
                  </div>
                ) : null}
                <div className={features.support ? 'mt-7 border-t border-slate-200 pt-6 dark:border-white/10' : ''}>
                  <h3 className="text-sm font-semibold text-slate-950 dark:text-white">Документы</h3>
                  <nav className="mt-3 grid gap-2 sm:grid-cols-2" aria-label="Правовая информация">
                    {legalNavigation.map((item) => (
                      <Link key={item.href} href={item.href} className="flex min-h-11 items-center justify-between gap-2 rounded-lg border border-slate-200 px-3.5 py-2 text-sm font-medium text-slate-700 hover:border-slate-300 hover:bg-slate-50 dark:border-white/10 dark:text-slate-200 dark:hover:bg-white/[0.05]">
                        {item.label}<ArrowUpRight className="h-4 w-4 shrink-0 text-slate-400" />
                      </Link>
                    ))}
                  </nav>
                </div>
              </SettingsSection>
            ),
          },
        ]}
      />
    </div>
  )
}

function isSettingsSection(value: string | undefined): value is SettingsTabId {
  return value === 'account' || value === 'security' || value === 'telegram' || value === 'notifications' || value === 'data'
}

function SettingsSection({ id, title, description, icon, children }: {
  id: string
  title: string
  description: string
  icon: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section id={id} className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm shadow-slate-950/[0.025] dark:border-white/10 dark:bg-white/[0.025] dark:shadow-none">
      <div className="flex min-w-0 items-start gap-3 border-b border-slate-200 px-4 py-4 dark:border-white/10 sm:px-7 sm:py-6">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-cyan-50 text-cyan-800 dark:bg-cyan-400/10 dark:text-cyan-200">{icon}</span>
        <div className="min-w-0">
          <h2 className="text-xl font-semibold tracking-tight text-slate-950 dark:text-white">{title}</h2>
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{description}</p>
        </div>
      </div>
      <div className="min-w-0 px-4 py-5 sm:px-7 sm:py-7">{children}</div>
    </section>
  )
}

function DataAction({ href, icon, title, description, danger = false }: {
  href: string
  icon: React.ReactNode
  title: string
  description: string
  danger?: boolean
}) {
  return (
    <Link href={href} className="group flex min-h-16 items-center gap-3 rounded-xl border border-slate-200 px-4 py-3 transition-colors hover:border-slate-300 hover:bg-slate-50 dark:border-white/10 dark:hover:border-white/20 dark:hover:bg-white/[0.04]">
      <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${danger ? 'bg-rose-50 text-rose-700 dark:bg-rose-400/10 dark:text-rose-300' : 'bg-slate-100 text-slate-700 dark:bg-white/[0.06] dark:text-slate-200'}`}>{icon}</span>
      <span className="min-w-0 flex-1">
        <span className={`block text-sm font-semibold ${danger ? 'text-rose-700 dark:text-rose-300' : 'text-slate-950 dark:text-white'}`}>{title}</span>
        <span className="mt-0.5 block text-xs leading-5 text-slate-500 dark:text-slate-400">{description}</span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5" />
    </Link>
  )
}
