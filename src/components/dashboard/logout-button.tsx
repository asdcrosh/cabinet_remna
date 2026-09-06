'use client'

import { useRouter } from 'next/navigation'
import { apiFetch } from '@/lib/api-client'
import { LogOut } from 'lucide-react'

export function LogoutButton() {
  const router = useRouter()
  return (
    <button
      type="button"
      onClick={async () => {
        await apiFetch('/api/auth/logout', { method: 'POST' })
        router.push('/login')
        router.refresh()
      }}
      className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-rose-700
                 transition-colors hover:bg-rose-50 hover:text-rose-900 dark:text-rose-200 dark:hover:bg-rose-400/10 dark:hover:text-rose-100"
    >
      <LogOut className="h-4 w-4" />
      Выйти
    </button>
  )
}
