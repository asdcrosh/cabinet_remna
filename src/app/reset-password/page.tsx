import Link from 'next/link'
import { redirect } from 'next/navigation'
import { AuthLayout } from '@/components/auth/auth-layout'
import { ResetPasswordForm } from '@/components/auth/reset-password-form'
import { getCurrentUser } from '@/lib/auth/cookies'

export const metadata = { title: 'Новый пароль — Личный кабинет' }

export default async function ResetPasswordPage({ searchParams }: { searchParams: { token?: string } }) {
  const session = await getCurrentUser()
  if (session) redirect('/dashboard')

  const token = searchParams.token?.trim()

  return (
    <AuthLayout
      title="Новый пароль"
      description="Задайте новый пароль для входа в кабинет"
      footer={<Link href="/login" className="text-brand-600 hover:underline">Вернуться ко входу</Link>}
    >
      {token ? (
        <ResetPasswordForm token={token} />
      ) : (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
          Ссылка восстановления некорректна.
        </div>
      )}
    </AuthLayout>
  )
}
