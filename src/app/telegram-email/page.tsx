import { redirect } from 'next/navigation'
import { Send } from 'lucide-react'
import { getSession } from '@/lib/auth/cookies'
import { prisma } from '@/lib/prisma'
import { getBrandName } from '@/lib/branding'
import { TelegramEmailForm } from '@/components/auth/telegram-email-form'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Подтверждение email' }

export default async function TelegramEmailPage() {
  const session = await getSession()
  if (!session) redirect('/login')
  if (session.stage !== 'EMAIL_PENDING') redirect('/dashboard')

  const user = await prisma.user.findUnique({
    where: { id: session.uid },
    select: { email: true, name: true, telegramUsername: true, emailVerifiedAt: true },
  })
  if (!user) redirect('/login')
  if (user.emailVerifiedAt) redirect('/dashboard')

  return (
    <main className="grid min-h-dvh place-items-center px-4 py-8">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-lg bg-sky-100 text-sky-600 dark:bg-sky-500/10 dark:text-sky-300">
            <Send className="h-6 w-6" />
          </div>
          <h1 className="mt-4 text-2xl font-semibold">{getBrandName()}</h1>
          <p className="mt-1 text-sm text-slate-500">Добавьте email и пароль для входа на сайте</p>
        </div>
        <div className="card">
          <TelegramEmailForm
            initialEmail={user.email}
            telegramName={user.telegramUsername ? `@${user.telegramUsername}` : user.name}
          />
        </div>
      </div>
    </main>
  )
}
