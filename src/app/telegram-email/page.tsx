import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/cookies'
import { prisma } from '@/lib/prisma'
import { TelegramEmailForm } from '@/components/auth/telegram-email-form'
import { AuthLayout } from '@/components/auth/auth-layout'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Подтверждение email' }

export default async function TelegramEmailPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  const user = await prisma.user.findUnique({
    where: { id: session.uid },
    select: { email: true, name: true, telegramId: true, telegramUsername: true, emailVerifiedAt: true },
  })
  if (!user) redirect('/login')
  if (!user.telegramId) redirect('/dashboard/settings')
  if (user.emailVerifiedAt) redirect('/dashboard/settings')

  return (
    <AuthLayout
      title="Добавьте email"
      description="Создайте дополнительный способ входа и сохраните доступ к аккаунту."
      footer={<Link href="/dashboard/settings" className="text-brand-600 hover:underline">Вернуться в настройки</Link>}
    >
      <TelegramEmailForm
        initialEmail={user.email}
        telegramName={user.telegramUsername ? `@${user.telegramUsername}` : user.name}
      />
    </AuthLayout>
  )
}
