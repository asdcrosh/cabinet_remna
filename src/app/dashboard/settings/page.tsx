import Link from 'next/link'
import { redirect } from 'next/navigation'
import { MailPlus } from 'lucide-react'
import { getCurrentUser } from '@/lib/auth/cookies'
import { prisma } from '@/lib/prisma'
import { ChangePasswordForm } from '@/components/dashboard/change-password-form'
import { PaymentHistory } from '@/components/dashboard/payment-history'
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
        description="Аккаунт и безопасность"
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
                title="Аккаунт"
                description="Информация профиля и текущий статус"
              >
                <div className="min-w-0">
                  <div className="mb-4 grid gap-x-3 gap-y-2 text-sm sm:grid-cols-2 xl:grid-cols-4">
                    <AccountFact label="Email" value={hasVerifiedEmail ? user.email : 'не добавлен'} />
                    <AccountFact label="Telegram" value={user.telegramId ? 'привязан' : 'не привязан'} />
                    <AccountFact label="VPN" value={user.remnawaveUsername ? 'готов' : 'пока нет'} />
                    <AccountFact label="Регистрация" value={new Date(user.createdAt).toLocaleDateString('ru-RU')} />
                  </div>
                  <ProfileForm name={user.name} />
                </div>
              </SettingsSection>
            ),
          },
          {
            id: 'sync',
            title: 'Синхронизация',
            shortTitle: 'Связь',
            children: (
              <SettingsSection
                id="sync"
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
                  <div className="border-t border-slate-200 pt-4 dark:border-white/10 xl:border-l xl:border-t-0 xl:pl-4 xl:pt-0">
                    <div className="flex items-center gap-3">
                      <div className="grid h-10 w-10 shrink-0 place-items-center text-cyan-700 dark:text-cyan-200">
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
                      <div className="mt-4 text-sm text-slate-500 dark:text-slate-400">
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
            children: (
              <SettingsSection
                id="security"
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
            children: (
              <SettingsSection
                id="payments"
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
  title,
  description,
  children,
  className,
}: {
  id: string
  title: string
  description: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <section
      id={id}
      className={`scroll-mt-20 rounded-2xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-white/[0.035] sm:p-5 ${className ?? ''}`}
    >
      <div className="mb-4 min-w-0">
        <h2 className="text-base font-semibold text-slate-950 dark:text-white sm:text-lg">{title}</h2>
        <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{description}</p>
      </div>
      {children}
    </section>
  )
}

function AccountFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 border-l border-slate-200 px-3 py-1 dark:border-white/10">
      <div className="text-xs text-slate-500 dark:text-slate-400">{label}</div>
      <div className="mt-1 truncate font-medium text-slate-950 dark:text-white" title={value}>{value}</div>
    </div>
  )
}
