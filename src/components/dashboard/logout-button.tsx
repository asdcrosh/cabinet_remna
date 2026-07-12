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
      className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-slate-600
                 transition-colors hover:bg-slate-100 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-surface-800 dark:hover:text-white"
    >
      <LogOut className="h-4 w-4" />
      Выйти
    </button>
  )
}
