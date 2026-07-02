import type { ReactNode } from 'react'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import {
  CheckCircle2,
  ChevronRight,
  CreditCard,
  LockKeyhole,
  MailPlus,
  Send,
  ShieldCheck,
  UserRound,
} from 'lucide-react'
import { getCurrentUser } from '@/lib/auth/cookies'
import { prisma } from '@/lib/prisma'
import { ChangePasswordForm } from '@/components/dashboard/change-password-form'
import { PageHeader } from '@/components/dashboard/page-header'
import { ProfileForm } from '@/components/dashboard/profile-form'
import { TelegramLinkCard } from '@/components/dashboard/telegram-link-card'
import { cn } from '@/lib/cn'

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
    <div className="mx-auto max-w-6xl space-y-4 sm:space-y-5">
      <PageHeader title="Настройки" description="Аккаунт, Telegram и безопасность" />

      <div className="grid items-start gap-3 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <SettingsSection
          icon={<UserRound className="h-5 w-5" />}
          title="Аккаунт"
          description="Основные данные профиля"
        >
          <div className="mb-4 grid gap-2 text-sm sm:grid-cols-3">
            <AccountFact label="Email" value={hasVerifiedEmail ? user.email : 'не добавлен'} />
            <AccountFact label="Регистрация" value={new Date(user.createdAt).toLocaleDateString('ru-RU')} />
            <AccountFact label="VPN профиль" value={user.remnawaveUsername ? 'создан' : 'пока не создан'} />
          </div>
          <ProfileForm name={user.name} />
        </SettingsSection>

        <aside className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
          <LinkTile
            href="/dashboard/billing"
            icon={<CreditCard className="h-5 w-5" />}
            title="История платежей"
            description="Оплаты, статусы и выдача"
          />

          {!hasVerifiedEmail && user.telegramId && (
            <LinkTile
              href="/telegram-email"
              icon={<MailPlus className="h-5 w-5" />}
              title="Добавить email"
              description="Для входа по email"
            />
          )}

          <StatusPanel
            emailReady={hasVerifiedEmail}
            telegramReady={Boolean(user.telegramId)}
            vpnReady={Boolean(user.remnawaveUsername)}
          />
        </aside>
      </div>

      <div className="grid items-start gap-3 lg:grid-cols-[minmax(0,1fr)_23rem]">
        <SettingsSection
          icon={<Send className="h-5 w-5" />}
          title="Telegram"
          description="Связь аккаунта и перенос подписки"
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
            description="Вход по email"
          >
            <ChangePasswordForm />
          </SettingsSection>
        )}
      </div>
    </div>
  )
}

function SettingsSection({
  icon,
  title,
  description,
  children,
  className,
}: {
  icon: ReactNode
  title: string
  description: string
  children: ReactNode
  className?: string
}) {
  return (
    <section
      className={cn(
        'overflow-hidden rounded-lg border border-slate-200/80 bg-white/90 shadow-sm shadow-slate-200/50 backdrop-blur dark:border-white/10 dark:bg-white/[0.045] dark:shadow-black/20',
        className
      )}
    >
      <div className="border-b border-slate-100 bg-slate-50/55 px-3 py-3 dark:border-white/10 dark:bg-white/[0.025] sm:px-4">
        <div className="flex items-center gap-3">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-slate-950 text-cyan-200 shadow-sm dark:bg-cyan-300/10 dark:text-cyan-200">
            {icon}
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-slate-950 dark:text-white sm:text-lg">{title}</h2>
            <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{description}</p>
          </div>
        </div>
      </div>
      <div className="p-3 sm:p-4">{children}</div>
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
      className="group flex min-h-20 items-center justify-between gap-3 rounded-lg border border-slate-200/80 bg-white/90 p-3 shadow-sm shadow-slate-200/50 transition hover:-translate-y-0.5 hover:border-cyan-200 hover:bg-cyan-50/50 hover:shadow-md dark:border-white/10 dark:bg-white/[0.045] dark:shadow-black/20 dark:hover:border-cyan-500/30 dark:hover:bg-cyan-500/10"
    >
      <div className="flex min-w-0 items-center gap-3">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-slate-950 text-cyan-200 dark:bg-cyan-300/10 dark:text-cyan-200">
          {icon}
        </div>
        <div className="min-w-0">
          <h2 className="truncate font-semibold text-slate-950 dark:text-white">{title}</h2>
          <p className="mt-1 truncate text-sm text-slate-500 dark:text-slate-400">{description}</p>
        </div>
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-cyan-600 dark:group-hover:text-cyan-300" />
    </Link>
  )
}

function AccountFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-slate-200/80 bg-slate-50/80 px-3 py-2.5 dark:border-white/10 dark:bg-surface-950/45">
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
    <div className="rounded-lg border border-slate-200/80 bg-white/90 p-3 shadow-sm shadow-slate-200/50 dark:border-white/10 dark:bg-white/[0.045] dark:shadow-black/20">
      <div className="flex items-center gap-3">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300">
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
    <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200/80 bg-slate-50/80 px-3 py-2 text-sm dark:border-white/10 dark:bg-surface-950/45">
      <span className="text-slate-500 dark:text-slate-400">{label}</span>
      <span className={`inline-flex items-center gap-1.5 font-medium ${active ? 'text-emerald-600 dark:text-emerald-300' : 'text-slate-400'}`}>
        {active ? <CheckCircle2 className="h-3.5 w-3.5" /> : null}
        {value}
      </span>
    </div>
  )
}
