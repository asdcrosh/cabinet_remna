'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { RefreshCw } from 'lucide-react'
import { apiFetch } from '@/lib/api-client'
import { toast } from '@/components/ui/toaster'

export function UserSyncButton({ userId }: { userId: string }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  async function sync() {
    setLoading(true)
    try {
      const response = await apiFetch<{
        result: {
          telegram: boolean
          remnawave: boolean
          remnashopPayments: number
          warnings: string[]
        }
      }>(`/api/admin/users/${userId}/sync`, { method: 'POST' })
      const warnings = response.result.warnings.length
      toast(
        warnings
          ? `Синхронизация выполнена с предупреждениями: ${warnings}`
          : 'Пользователь синхронизирован',
        warnings ? undefined : 'success'
      )
      router.refresh()
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      type="button"
      className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-600 shadow-sm transition-colors hover:border-sky-200 hover:bg-sky-50 hover:text-sky-700 disabled:opacity-60 dark:border-white/10 dark:bg-surface-900"
      onClick={() => void sync()}
      disabled={loading}
      title="Синхронизировать пользователя"
      aria-label="Синхронизировать пользователя"
    >
      <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
      <span className="hidden sm:inline">{loading ? 'Sync...' : 'Sync'}</span>
    </button>
  )
}
