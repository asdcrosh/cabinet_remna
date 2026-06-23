import Link from 'next/link'
import { redirect } from 'next/navigation'
import { AuthLayout } from '@/components/auth/auth-layout'
import { ForgotPasswordForm } from '@/components/auth/forgot-password-form'
import { getCurrentUser } from '@/lib/auth/cookies'

export const metadata = { title: 'Восстановление пароля' }

export default async function ForgotPasswordPage() {
  const session = await getCurrentUser()
  if (session) redirect('/dashboard')

  return (
    <AuthLayout
      title="Восстановление пароля"
      description="Введите email, и мы отправим ссылку для нового пароля"
      footer={<>Вспомнили пароль? <Link href="/login" className="text-brand-600 hover:underline">Войти</Link></>}
    >
      <ForgotPasswordForm />
    </AuthLayout>
  )
}
