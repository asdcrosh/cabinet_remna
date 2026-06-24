// /dashboard/settings — профиль + смена пароля.

import { getCurrentUser } from '@/lib/auth/cookies'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import { ChangePasswordForm } from '@/components/dashboard/change-password-form'
import { PageHeader } from '@/components/dashboard/page-header'
import { ProfileForm } from '@/components/dashboard/profile-form'
import { TelegramLinkCard } from '@/components/dashboard/telegram-link-card'
import Link from 'next/link'
import { MailPlus } from 'lucide-react'

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
    <div className="max-w-2xl space-y-6">
      <PageHeader title="Настройки" description="Профиль и безопасность аккаунта" />

      <div className="card">
        <h2 className="text-lg font-semibold mb-4">Профиль</h2>
        <div className="mb-5 grid gap-3 rounded-lg bg-slate-50 p-4 text-sm dark:bg-surface-800 sm:grid-cols-2">
          <div>
            <div className="text-slate-500">Email</div>
            <div className="font-medium">{hasVerifiedEmail ? user.email : 'не добавлен'}</div>
          </div>
          <div>
            <div className="text-slate-500">Дата регистрации</div>
            <div className="font-medium">{new Date(user.createdAt).toLocaleDateString('ru-RU')}</div>
          </div>
        </div>
        <ProfileForm name={user.name} />
        <details className="mt-5 text-sm text-slate-500">
          <summary className="cursor-pointer hover:text-slate-700 dark:hover:text-slate-300">
            Дополнительная информация
          </summary>
          <div className="mt-3 rounded-lg bg-slate-50 p-3 font-mono text-xs dark:bg-surface-800">
            Профиль доступа: {user.remnawaveUsername ? 'создан' : 'пока не создан'}
          </div>
        </details>
      </div>

      {!hasVerifiedEmail && user.telegramId && (
        <div className="card flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-300">
              <MailPlus className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-semibold">Вход по email</h2>
              <p className="mt-1 text-sm text-slate-500">
                Необязательно. Добавьте email и пароль, чтобы входить в кабинет без Telegram.
              </p>
            </div>
          </div>
          <Link href="/telegram-email" className="btn-secondary shrink-0">
            Добавить email
          </Link>
        </div>
      )}

      <TelegramLinkCard
        telegramClientId={telegramClientId}
        appUrl={appUrl}
        telegramId={user.telegramId?.toString() ?? null}
        telegramUsername={user.telegramUsername}
        remnashopUserId={user.remnashopUserId}
        remnawaveUsername={user.remnawaveUsername}
      />

      {hasVerifiedEmail && (
        <div className="card">
          <h2 className="text-lg font-semibold mb-4">Смена пароля</h2>
          <ChangePasswordForm />
        </div>
      )}
    </div>
  )
}
