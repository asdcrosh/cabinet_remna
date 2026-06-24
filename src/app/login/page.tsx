// Страница входа. Серверный редирект если уже залогинен.

import { LoginForm } from '@/components/auth/login-form'
import { AuthLayout } from '@/components/auth/auth-layout'
import { getCurrentUser } from '@/lib/auth/cookies'
import { redirect } from 'next/navigation'
import Link from 'next/link'

export const metadata = { title: 'Вход' }

export default async function LoginPage() {
  const session = await getCurrentUser()
  if (session?.stage === 'EMAIL_PENDING') redirect('/telegram-email')
  if (session) redirect('/dashboard')

  return (
    <AuthLayout
      title="Вход в кабинет"
      description="Войдите, чтобы управлять подпиской"
      footer={<>Нет аккаунта? <Link href="/register" className="text-brand-600 hover:underline">Зарегистрироваться</Link></>}
    >
      <LoginForm />
    </AuthLayout>
  )
}
