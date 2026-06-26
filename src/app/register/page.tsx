// Страница регистрации. Серверный редирект если уже залогинен.

import { RegisterForm } from '@/components/auth/register-form'
import { AuthLayout } from '@/components/auth/auth-layout'
import { getCurrentUser } from '@/lib/auth/cookies'
import { redirect } from 'next/navigation'
import Link from 'next/link'

export const metadata = { title: 'Регистрация' }

const googleEnabled = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)

export default async function RegisterPage({ searchParams }: { searchParams: { ref?: string } }) {
  const session = await getCurrentUser()
  if (session) redirect('/dashboard')

  return (
    <AuthLayout
      title="Создать аккаунт"
      description="Регистрация занимает меньше минуты"
      footer={<>Уже есть аккаунт? <Link href="/login" className="text-brand-600 hover:underline">Войти</Link></>}
      enableTelegramMiniApp
    >
      <RegisterForm initialReferralCode={searchParams.ref ?? ''} googleEnabled={googleEnabled} />
    </AuthLayout>
  )
}
