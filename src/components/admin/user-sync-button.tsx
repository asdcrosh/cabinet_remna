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
          devices: number
          remnashopPayments: number
          warnings: string[]
        }
      }>(`/api/admin/users/${userId}/sync`, { method: 'POST' })
      const warnings = response.result.warnings.filter(Boolean)
      const parts = [
        response.result.telegram ? 'Telegram' : null,
        response.result.remnawave ? 'Remnawave' : null,
        `${response.result.devices} устр.`,
      ].filter(Boolean)
      toast(
        warnings.length
          ? `Синхронизация завершена. ${parts.join(', ')}. Предупреждение: ${warnings.join('; ')}`
          : `Пользователь синхронизирован. ${parts.join(', ')}`,
        warnings.length ? undefined : 'success'
      )
      router.refresh()
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      type="button"
      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-600 shadow-sm transition-colors hover:border-sky-200 hover:bg-sky-50 hover:text-sky-700 disabled:opacity-60 dark:border-white/10 dark:bg-surface-900"
      onClick={() => void sync()}
      disabled={loading}
      title="Синхронизировать пользователя"
      aria-label="Синхронизировать пользователя"
    >
      <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
    </button>
  )
}
