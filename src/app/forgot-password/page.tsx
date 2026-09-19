import Link from 'next/link'
import { redirect } from 'next/navigation'
import { AuthLayout } from '@/components/auth/auth-layout'
import { ForgotPasswordForm } from '@/components/auth/forgot-password-form'
import { getCurrentUser } from '@/lib/auth/cookies'
import { sanitizeInternalNext } from '@/lib/auth/next-path'

export const metadata = { title: 'Восстановление пароля' }

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>
}) {
  const params = await searchParams
  const next = sanitizeInternalNext(params.next)
  const session = await getCurrentUser()
  if (session) redirect(next)

  return (
    <AuthLayout
      title="Восстановление пароля"
      description="Введите email, и мы отправим ссылку для нового пароля"
      footer={<>Вспомнили пароль? <Link href={`/login?next=${encodeURIComponent(next)}`} className="text-brand-600 hover:underline">Войти</Link></>}
    >
      <ForgotPasswordForm next={next} />
    </AuthLayout>
  )
}
