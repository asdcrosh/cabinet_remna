import Link from 'next/link'
import { redirect } from 'next/navigation'
import { AuthLayout } from '@/components/auth/auth-layout'
import { ResetPasswordForm } from '@/components/auth/reset-password-form'
import { FormAlert } from '@/components/ui/form-alert'
import { getCurrentUser } from '@/lib/auth/cookies'
import { sanitizeInternalNext } from '@/lib/auth/next-path'

export const metadata = { title: 'Новый пароль' }

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; next?: string }>
}) {
  const params = await searchParams
  const next = sanitizeInternalNext(params.next)
  const session = await getCurrentUser()
  if (session) redirect(next)

  const token = params.token?.trim()

  return (
    <AuthLayout
      title="Новый пароль"
      description="Задайте новый пароль для входа в кабинет"
      footer={<Link href={`/login?next=${encodeURIComponent(next)}`} className="text-brand-600 hover:underline">Вернуться ко входу</Link>}
    >
      {token ? (
        <ResetPasswordForm token={token} next={next} />
      ) : (
        <div className="space-y-3">
          <FormAlert tone="warning">
            Ссылка восстановления некорректна или устарела.
          </FormAlert>
          <Link href={`/forgot-password?next=${encodeURIComponent(next)}`} className="btn-primary w-full">
            Запросить новую ссылку
          </Link>
        </div>
      )}
    </AuthLayout>
  )
}
