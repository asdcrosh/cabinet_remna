'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { RefreshCw } from 'lucide-react'
import { apiFetch } from '@/lib/api-client'
import { toast } from '@/components/ui/toaster'

export function UserSyncButton({ userId, showLabel = false }: { userId: string; showLabel?: boolean }) {
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
      className={`btn-secondary h-10 min-h-10 shrink-0 hover:text-sky-700 dark:hover:text-sky-300 ${showLabel ? 'px-3' : 'w-10 px-0'}`}
      onClick={() => void sync()}
      disabled={loading}
      title="Синхронизировать пользователя"
      aria-label="Синхронизировать пользователя"
    >
      <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
      {showLabel ? <span>{loading ? 'Синхронизация...' : 'Синхронизировать'}</span> : null}
    </button>
  )
}
