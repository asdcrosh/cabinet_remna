import type { ReactNode } from 'react'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { CreditCard, LockKeyhole, MailPlus, Send, ShieldCheck, UserRound } from 'lucide-react'
import { getCurrentUser } from '@/lib/auth/cookies'
import { prisma } from '@/lib/prisma'
import { ChangePasswordForm } from '@/components/dashboard/change-password-form'
import { PageHeader } from '@/components/dashboard/page-header'
import { ProfileForm } from '@/components/dashboard/profile-form'
import { TelegramLinkCard } from '@/components/dashboard/telegram-link-card'

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
    <div className="space-y-6">
      <PageHeader title="Настройки" description="Профиль и безопасность аккаунта" />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <SettingsSection
          icon={<UserRound className="h-5 w-5" />}
          title="Аккаунт"
          description="Основные данные профиля"
        >
          <div className="mb-5 grid gap-3 text-sm sm:grid-cols-3">
            <AccountFact label="Email" value={hasVerifiedEmail ? user.email : 'не добавлен'} />
            <AccountFact label="Регистрация" value={new Date(user.createdAt).toLocaleDateString('ru-RU')} />
            <AccountFact label="VPN профиль" value={user.remnawaveUsername ? 'создан' : 'пока не создан'} />
          </div>
          <ProfileForm name={user.name} />
        </SettingsSection>

        <div className="space-y-4">
          <LinkTile
            href="/dashboard/billing"
            icon={<CreditCard className="h-5 w-5" />}
            title="История платежей"
            description="Оплаты, статусы и выдача подписки"
          />

          {!hasVerifiedEmail && user.telegramId && (
            <LinkTile
              href="/telegram-email"
              icon={<MailPlus className="h-5 w-5" />}
              title="Добавить email"
              description="Для входа без Telegram"
            />
          )}

          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-surface-900">
            <div className="flex items-start gap-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div>
                <h2 className="font-semibold">Статус аккаунта</h2>
                <div className="mt-3 space-y-2 text-sm text-slate-500">
                  <StatusLine label="Email" value={hasVerifiedEmail ? 'подтверждён' : 'не добавлен'} active={hasVerifiedEmail} />
                  <StatusLine label="Telegram" value={user.telegramId ? 'привязан' : 'не привязан'} active={Boolean(user.telegramId)} />
                  <StatusLine label="VPN" value={user.remnawaveUsername ? 'готов' : 'пока нет'} active={Boolean(user.remnawaveUsername)} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <SettingsSection
        icon={<Send className="h-5 w-5" />}
        title="Telegram"
        description="Связь аккаунта и перенос старой подписки"
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

      {hasVerifiedEmail && (
        <SettingsSection
          icon={<LockKeyhole className="h-5 w-5" />}
          title="Пароль"
          description="Смена пароля для входа по email"
          narrow
        >
          <ChangePasswordForm />
        </SettingsSection>
      )}
    </div>
  )
}

function SettingsSection({
  icon,
  title,
  description,
  children,
  narrow = false,
}: {
  icon: ReactNode
  title: string
  description: string
  children: ReactNode
  narrow?: boolean
}) {
  return (
    <section className={`rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-surface-900 sm:p-5 ${narrow ? 'max-w-2xl' : ''}`}>
      <div className="mb-5 flex items-start gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-slate-950 text-cyan-200 dark:bg-white dark:text-slate-950">
          {icon}
        </div>
        <div className="min-w-0">
          <h2 className="text-lg font-semibold">{title}</h2>
          <p className="mt-1 text-sm text-slate-500">{description}</p>
        </div>
      </div>
      {children}
    </section>
  )
}

function LinkTile({
  href,
  icon,
  title,
  description,
}: {
  href: string
  icon: ReactNode
  title: string
  description: string
}) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between gap-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition-colors hover:border-cyan-200 hover:bg-cyan-50/40 dark:border-white/10 dark:bg-surface-900 dark:hover:bg-cyan-500/5"
    >
      <div className="flex min-w-0 items-center gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-slate-950 text-cyan-200 dark:bg-white dark:text-slate-950">
          {icon}
        </div>
        <div className="min-w-0">
          <h2 className="truncate font-semibold">{title}</h2>
          <p className="mt-1 truncate text-sm text-slate-500">{description}</p>
        </div>
      </div>
      <span className="shrink-0 text-sm font-medium text-slate-500">Открыть</span>
    </Link>
  )
}

function AccountFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg bg-slate-50 px-3 py-2 dark:bg-white/[0.03]">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 truncate font-medium">{value}</div>
    </div>
  )
}

function StatusLine({ label, value, active }: { label: string; value: string; active: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span>{label}</span>
      <span className={active ? 'font-medium text-emerald-600 dark:text-emerald-300' : 'text-slate-400'}>{value}</span>
    </div>
  )
}
