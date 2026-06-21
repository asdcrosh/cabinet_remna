// Главная: редиректим авторизованных в /dashboard, остальных на /login.

import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth/cookies'

export default async function HomePage() {
  const session = await getCurrentUser()
  if (session) redirect('/dashboard')
  redirect('/login')
}
