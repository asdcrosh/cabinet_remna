import type { ReactNode } from 'react'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import {
  CheckCircle2,
  CreditCard,
  Database,
  LockKeyhole,
  MailPlus,
  ShieldCheck,
  UserRound,
} from 'lucide-react'
import { getCurrentUser } from '@/lib/auth/cookies'
import { prisma } from '@/lib/prisma'
import { ChangePasswordForm } from '@/components/dashboard/change-password-form'
import { PaymentHistory } from '@/components/dashboard/payment-history'
import { ProfileForm } from '@/components/dashboard/profile-form'
import { SettingsTabs } from '@/components/dashboard/settings-tabs'
import { TelegramLinkCard } from '@/components/dashboard/telegram-link-card'
import { PageHeader } from '@/components/dashboard/page-header'
import { cn } from '@/lib/cn'

export const dynamic = 'force-dynamic'

const telegramClientId = process.env.TELEGRAM_CLIENT_ID?.trim() || null
const appUrl = process.env.APP_URL?.trim() || null

export default async function SettingsPage() {
  const session = await getCurrentUser()
  if (!session) redirect('/login')
  const user = await prisma.user.findUnique({ where: { id: session.uid } })
  if (!user) redirect('/login')
  const payments = await prisma.payment.findMany({
    where: { userId: session.uid },
    orderBy: { createdAt: 'desc' },
    take: 12,
    include: { plan: true, subscription: true },
  })
  const hasVerifiedEmail = Boolean(user.emailVerifiedAt && !user.email.endsWith('@pending.invalid'))

  return (
    <div className="mx-auto max-w-6xl page-stack">
      <PageHeader
        title="Настройки"
        description="Аккаунт, синхронизация, безопасность и платежи"
      />

      <SettingsTabs
        sections={[
          {
            id: 'account',
            title: 'Аккаунт',
            shortTitle: 'Аккаунт',
            description: 'Инфа и статус',
            children: (
              <SettingsSection
                id="account"
                icon={<UserRound className="h-5 w-5" />}
                title="Аккаунт"
                description="Информация профиля и текущий статус"
              >
                <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_18rem]">
                  <div className="min-w-0">
                    <div className="mb-4 grid gap-2 text-sm sm:grid-cols-3">
                      <AccountFact label="Email" value={hasVerifiedEmail ? user.email : 'не добавлен'} />
                      <AccountFact label="Регистрация" value={new Date(user.createdAt).toLocaleDateString('ru-RU')} />
                      <AccountFact label="VPN профиль" value={user.remnawaveUsername ? 'создан' : 'пока не создан'} />
                    </div>
                    <ProfileForm name={user.name} />
                  </div>
                  <StatusPanel
                    emailReady={hasVerifiedEmail}
                    telegramReady={Boolean(user.telegramId)}
                    vpnReady={Boolean(user.remnawaveUsername)}
                  />
                </div>
              </SettingsSection>
            ),
          },
          {
            id: 'sync',
            title: 'Синхронизация',
            shortTitle: 'Связь',
            description: 'Telegram и email',
            children: (
              <SettingsSection
                id="sync"
                icon={<Database className="h-5 w-5" />}
                title="Синхронизация"
                description="Перенос Telegram и привязка email"
              >
                <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_18rem]">
                  <TelegramLinkCard
                    telegramClientId={telegramClientId}
                    appUrl={appUrl}
                    telegramId={user.telegramId?.toString() ?? null}
                    telegramUsername={user.telegramUsername}
                    remnashopUserId={user.remnashopUserId}
                    remnawaveUsername={user.remnawaveUsername}
                    embedded
                  />
                  <div className="rounded-2xl border border-slate-200/80 bg-slate-50/80 p-4 dark:border-white/10 dark:bg-surface-950/45">
                    <div className="flex items-center gap-3">
                      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-cyan-50 text-cyan-700 dark:bg-cyan-400/10 dark:text-cyan-200">
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
                      <div className="mt-4 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-500 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-400">
                        {hasVerifiedEmail ? user.email : 'Сначала привяжите Telegram.'}
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
            description: 'Смена пароля',
            children: (
              <SettingsSection
                id="security"
                icon={<LockKeyhole className="h-5 w-5" />}
                title="Безопасность"
                description="Смена пароля для входа по email"
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
          {
            id: 'payments',
            title: 'История платежей',
            shortTitle: 'Платежи',
            description: `${payments.length} записей`,
            children: (
              <SettingsSection
                id="payments"
                icon={<CreditCard className="h-5 w-5" />}
                title="История платежей"
                description="Оплаты, статусы и выдача подписки"
              >
                <PaymentHistory payments={payments} />
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
  icon,
  title,
  description,
  children,
  className,
}: {
  id: string
  icon: ReactNode
  title: string
  description: string
  children: ReactNode
  className?: string
}) {
  return (
    <section
      id={id}
      className={cn(
        'scroll-mt-20 overflow-hidden rounded-3xl border border-slate-200/80 bg-white/90 shadow-sm shadow-slate-950/[0.04] backdrop-blur dark:border-white/10 dark:bg-white/[0.045] dark:shadow-black/20',
        className
      )}
    >
      <div className="border-b border-slate-100 px-4 py-4 dark:border-white/10 sm:px-5">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-cyan-50 text-cyan-700 dark:bg-cyan-300/10 dark:text-cyan-200">
            {icon}
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-slate-950 dark:text-white sm:text-lg">{title}</h2>
            <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{description}</p>
          </div>
        </div>
      </div>
      <div className="p-4 sm:p-5">{children}</div>
    </section>
  )
}

function AccountFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-slate-200/80 bg-slate-50/80 px-3 py-2.5 dark:border-white/10 dark:bg-surface-950/45">
      <div className="text-xs text-slate-500 dark:text-slate-400">{label}</div>
      <div className="mt-1 truncate font-medium text-slate-950 dark:text-white">{value}</div>
    </div>
  )
}

function StatusPanel({
  emailReady,
  telegramReady,
  vpnReady,
}: {
  emailReady: boolean
  telegramReady: boolean
  vpnReady: boolean
}) {
  const readyCount = [emailReady, telegramReady, vpnReady].filter(Boolean).length

  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white/90 p-4 shadow-sm shadow-slate-950/[0.04] dark:border-white/10 dark:bg-white/[0.045] dark:shadow-black/20">
      <div className="flex items-center gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300">
          <ShieldCheck className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <h2 className="font-semibold text-slate-950 dark:text-white">Статус аккаунта</h2>
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{readyCount}/3 готово</p>
        </div>
      </div>
      <div className="mt-4 grid gap-2">
        <StatusLine label="Email" value={emailReady ? 'подтверждён' : 'не добавлен'} active={emailReady} />
        <StatusLine label="Telegram" value={telegramReady ? 'привязан' : 'не привязан'} active={telegramReady} />
        <StatusLine label="VPN" value={vpnReady ? 'готов' : 'пока нет'} active={vpnReady} />
      </div>
    </div>
  )
}

function StatusLine({ label, value, active }: { label: string; value: string; active: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200/80 bg-slate-50/80 px-3 py-2.5 text-sm dark:border-white/10 dark:bg-surface-950/45">
      <span className="text-slate-500 dark:text-slate-400">{label}</span>
      <span className={`inline-flex items-center gap-1.5 font-medium ${active ? 'text-emerald-600 dark:text-emerald-300' : 'text-slate-400'}`}>
        {active ? <CheckCircle2 className="h-3.5 w-3.5" /> : null}
        {value}
      </span>
    </div>
  )
}
