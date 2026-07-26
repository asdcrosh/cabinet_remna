import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowRight, BadgeCheck, BookOpen, CircleAlert, CircleUserRound, Gift, Link2, LockKeyhole, MailPlus, MessageCircleQuestion, ReceiptText } from 'lucide-react'
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

export const dynamic = 'force-dynamic'

const telegramClientId = process.env.TELEGRAM_CLIENT_ID?.trim() || null
const appUrl = process.env.APP_URL?.trim() || null

export default async function SettingsPage() {
  const session = await getCurrentUser()
  if (!session) redirect('/login')
  const user = await prisma.user.findUnique({ where: { id: session.uid } })
  if (!user) redirect('/login')
  const features = await getFeatureFlags()
  const hasVerifiedEmail = Boolean(user.emailVerifiedAt && !user.email.endsWith('@pending.invalid'))
  const accountLinks = [
    { href: '/dashboard/billing', label: 'Покупки', description: 'Платежи и чеки', icon: ReceiptText, visible: true },
    { href: '/dashboard/referrals', label: 'Приглашения', description: 'Ссылка и вознаграждения', icon: Gift, visible: features.referrals },
    { href: '/dashboard/support', label: 'Поддержка', description: 'Вопросы и обращения', icon: MessageCircleQuestion, visible: features.support },
  ].filter((item) => item.visible)

  return (
    <div className="mx-auto max-w-5xl page-stack">
      <PageHeader
        title="Аккаунт"
        description="Личные данные и безопасность."
      />

      <SettingsTabs
        sections={[
          {
            id: 'account',
            title: 'Аккаунт',
            shortTitle: 'Аккаунт',
            children: (
              <SettingsSection
                id="account"
                title="Профиль"
                description="Основные данные и готовность аккаунта"
                icon={<CircleUserRound className="h-5 w-5" />}
              >
                <div className="min-w-0">
                  <div className="mb-4 grid gap-2 sm:grid-cols-2">
                    <AccountFact label="Email" value={hasVerifiedEmail ? user.email : 'Не добавлен'} ready={hasVerifiedEmail} />
                    <AccountFact label="Регистрация" value={new Date(user.createdAt).toLocaleDateString('ru-RU')} />
                  </div>
                  <ProfileForm name={user.name} />
                </div>
              </SettingsSection>
            ),
          },
          {
            id: 'sync',
            title: 'Способы входа',
            shortTitle: 'Вход',
            children: (
              <SettingsSection
                id="sync"
                title="Способы входа"
                description="Свяжите Telegram и email с одним аккаунтом"
                icon={<Link2 className="h-5 w-5" />}
              >
                <div className="grid border-y border-slate-200 dark:border-white/10 xl:grid-cols-[minmax(0,1fr)_20rem]">
                  <div className="py-4 xl:pr-5">
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
                  <div className="flex flex-col border-t border-slate-200 py-4 dark:border-white/10 xl:border-l xl:border-t-0 xl:pl-5">
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
        <h2 id="account-links-title" className="mb-2 text-sm font-semibold text-slate-950 dark:text-white">Другие разделы</h2>
        <div className="grid gap-2 sm:grid-cols-3">
          {accountLinks.map((item) => {
            const Icon = item.icon
            return (
              <Link key={item.href} href={item.href} className="group flex min-w-0 items-center gap-3 rounded-xl border border-slate-200/90 bg-white/55 px-3.5 py-3 transition-colors hover:bg-white dark:border-white/[0.09] dark:bg-white/[0.02] dark:hover:bg-white/[0.05]">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-500 transition-colors group-hover:bg-cyan-50 group-hover:text-cyan-700 dark:bg-white/[0.05] dark:text-slate-300 dark:group-hover:bg-cyan-300/10 dark:group-hover:text-cyan-200">
                  <Icon className="h-4 w-4" />
                </span>
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
      className={`scroll-mt-20 rounded-[1.25rem] border border-slate-200/90 bg-white/60 p-4 shadow-[0_18px_50px_-45px_rgba(15,23,42,0.55)] dark:border-white/[0.09] dark:bg-white/[0.025] sm:p-5 ${className ?? ''}`}
    >
      <div className="mb-4 flex min-w-0 items-start gap-2.5">
        <span className="mt-0.5 shrink-0 text-slate-400">{icon}</span>
        <div className="min-w-0 pt-0.5">
          <h2 className="text-base font-semibold text-slate-950 dark:text-white sm:text-lg">{title}</h2>
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{description}</p>
        </div>
      </div>
      {children}
    </section>
  )
}

function AccountFact({ label, value, ready }: { label: string; value: string; ready?: boolean }) {
  return (
    <div className="min-w-0 rounded-xl bg-slate-100/70 px-3 py-2.5 dark:bg-white/[0.04]">
      <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
        {ready !== undefined && <span className={`h-1.5 w-1.5 rounded-full ${ready ? 'bg-emerald-500' : 'bg-amber-500'}`} />}
        {label}
      </div>
      <div className="mt-1 truncate text-sm font-medium text-slate-950 dark:text-white" title={value}>{value}</div>
    </div>
  )
}
