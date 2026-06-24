// Главная: редиректим авторизованных в /dashboard, остальных на /login.

import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth/cookies'
import { prisma } from '@/lib/prisma'
import { logWarn } from '@/lib/logger'

export default async function HomePage() {
  const session = await getCurrentUser()
  if (session) {
    const user = await prisma.user.findUnique({
      where: { id: session.uid },
      select: { id: true },
    })
    if (user) redirect('/dashboard')
    logWarn('auth.home.stale_session_ignored', { userId: session.uid })
  }
  redirect('/login')
}
