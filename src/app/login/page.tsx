// Страница входа. Серверный редирект если уже залогинен.

import { LoginForm } from '@/components/auth/login-form'
import { AuthLayout } from '@/components/auth/auth-layout'
import { getCurrentUser } from '@/lib/auth/cookies'
import { prisma } from '@/lib/prisma'
import { logInfo, logWarn } from '@/lib/logger'
import { sanitizeInternalNext } from '@/lib/auth/next-path'
import { redirect } from 'next/navigation'
import Link from 'next/link'

export const metadata = { title: 'Вход' }

const yandexEnabled = Boolean(process.env.YANDEX_CLIENT_ID && process.env.YANDEX_CLIENT_SECRET)

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>
}) {
  const params = await searchParams
  const session = await getCurrentUser()
  if (session) {
    const user = await prisma.user.findUnique({
      where: { id: session.uid },
      select: { id: true },
    })
    if (user) {
      logInfo('auth.login.redirect_authenticated', { userId: session.uid })
      redirect(sanitizeInternalNext(params.next))
    }
    logWarn('auth.login.stale_session_ignored', { userId: session.uid })
  }

  return (
    <AuthLayout
      title="Вход в кабинет"
      description="Войдите, чтобы управлять подпиской"
      footer={<>Нет аккаунта? <Link href="/register" className="text-brand-600 hover:underline">Зарегистрироваться</Link></>}
      enableTelegramMiniApp
    >
      <LoginForm yandexEnabled={yandexEnabled} />
    </AuthLayout>
  )
}
