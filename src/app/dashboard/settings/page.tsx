import Link from 'next/link'
import { redirect } from 'next/navigation'
import { BadgeCheck, CircleAlert, CircleUserRound, Link2, LockKeyhole, MailPlus, ReceiptText } from 'lucide-react'
import { getCurrentUser } from '@/lib/auth/cookies'
import { prisma } from '@/lib/prisma'
import { ChangePasswordForm } from '@/components/dashboard/change-password-form'
import { ProfileForm } from '@/components/dashboard/profile-form'
import { SettingsTabs } from '@/components/dashboard/settings-tabs'
import { TelegramLinkCard } from '@/components/dashboard/telegram-link-card'
import { PageHeader } from '@/components/dashboard/page-header'

export const dynamic = 'force-dynamic'

const telegramClientId = process.env.TELEGRAM_CLIENT_ID?.trim() || null
const appUrl = process.env.APP_URL?.trim() || null

export default async function SettingsPage() {
  const session = await getCurrentUser()
  if (!session) redirect('/login')
  const user = await prisma.user.findUnique({ where: { id: session.uid } })
  if (!user) redirect('/login')
  const hasVerifiedEmail = Boolean(user.emailVerifiedAt && !user.email.endsWith('@pending.invalid'))

  return (
    <div className="mx-auto max-w-6xl page-stack">
      <PageHeader
        title="Настройки"
        description="Профиль, способы входа и безопасность аккаунта."
        action={(
          <Link href="/dashboard/billing" className="btn-secondary w-full sm:w-auto">
            <ReceiptText className="h-4 w-4" />
            История платежей
          </Link>
        )}
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
                  <div className="mb-5 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                    <AccountFact label="Email" value={hasVerifiedEmail ? user.email : 'Не добавлен'} ready={hasVerifiedEmail} />
                    <AccountFact label="Telegram" value={user.telegramId ? 'Привязан' : 'Не привязан'} ready={Boolean(user.telegramId)} />
                    <AccountFact label="VPN-профиль" value={user.remnawaveUsername ? 'Готов' : 'Пока нет'} ready={Boolean(user.remnawaveUsername)} />
                    <AccountFact label="Регистрация" value={new Date(user.createdAt).toLocaleDateString('ru-RU')} />
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 dark:border-white/[0.08] dark:bg-white/[0.025]">
                    <ProfileForm name={user.name} />
                  </div>
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
                <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_20rem]">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 dark:border-white/[0.08] dark:bg-white/[0.025]">
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
                  <div className="flex flex-col rounded-2xl border border-slate-200 bg-slate-50/70 p-4 dark:border-white/[0.08] dark:bg-white/[0.025]">
                    <div className="flex items-center gap-3">
                      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-cyan-700 shadow-sm dark:bg-white/[0.06] dark:text-cyan-200 dark:shadow-none">
                        <MailPlus className="h-5 w-5" />
                      </div>
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
                      <div className={`mt-4 flex items-start gap-2 rounded-xl border px-3 py-2.5 text-sm ${hasVerifiedEmail ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-100' : 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100'}`}>
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
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
                    Добавьте и подтвердите email, чтобы включить вход по паролю.
                  </div>
                )}
              </SettingsSection>
            ),
          },
        ]}
      />
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
      className={`scroll-mt-20 rounded-3xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-white/[0.035] sm:p-5 ${className ?? ''}`}
    >
      <div className="mb-5 flex min-w-0 items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-cyan-50 text-cyan-700 dark:bg-cyan-400/10 dark:text-cyan-200">{icon}</span>
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
    <div className="min-w-0 rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2.5 dark:border-white/[0.07] dark:bg-white/[0.025]">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
        {ready !== undefined && <span className={`h-1.5 w-1.5 rounded-full ${ready ? 'bg-emerald-500' : 'bg-amber-500'}`} />}
        {label}
      </div>
      <div className="mt-1 truncate text-sm font-semibold text-slate-950 dark:text-white" title={value}>{value}</div>
    </div>
  )
}
