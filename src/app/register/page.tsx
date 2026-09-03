// Страница регистрации. Серверный редирект если уже залогинен.

import { RegisterForm } from '@/components/auth/register-form'
import { AuthLayout } from '@/components/auth/auth-layout'
import { getCurrentUser } from '@/lib/auth/cookies'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { sanitizeInternalNext } from '@/lib/auth/next-path'

export const metadata = { title: 'Регистрация' }

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string; plan?: string }>
}) {
  const params = await searchParams
  const planId = params.plan?.trim().slice(0, 64)
  const nextPath = sanitizeInternalNext(
    planId ? `/dashboard/plans?plan=${encodeURIComponent(planId)}` : undefined
  )
  const yandexEnabled = Boolean(process.env.YANDEX_CLIENT_ID && process.env.YANDEX_CLIENT_SECRET)
  const session = await getCurrentUser()
  if (session) redirect(nextPath)

  return (
    <AuthLayout
      title="Создать аккаунт"
      description="Регистрация занимает меньше минуты"
      footer={<>Уже есть аккаунт? <Link href={`/login?next=${encodeURIComponent(nextPath)}`} className="text-brand-600 hover:underline">Войти</Link></>}
      enableTelegramMiniApp
    >
      <RegisterForm initialReferralCode={params.ref ?? ''} initialNextPath={nextPath} yandexEnabled={yandexEnabled} />
    </AuthLayout>
  )
}
