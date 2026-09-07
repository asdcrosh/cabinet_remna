'use client'

import { useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { apiFetch } from '@/lib/api-client'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { toast } from '@/components/ui/toaster'

export function BulkUserSyncButton({ userIds }: { userIds: string[] }) {
  const router = useRouter()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [processed, setProcessed] = useState(0)
  const uniqueUserIds = Array.from(new Set(userIds)).slice(0, 50)

  async function syncShownUsers() {
    setLoading(true)
    setProcessed(0)
    let succeeded = 0
    let failed = 0

    for (const userId of uniqueUserIds) {
      try {
        await apiFetch(`/api/admin/users/${userId}/sync`, { method: 'POST' })
        succeeded += 1
      } catch {
        failed += 1
      } finally {
        setProcessed((value) => value + 1)
      }
    }

    toast(
      failed > 0
        ? `Синхронизировано: ${succeeded}. Не удалось: ${failed}.`
        : `Синхронизировано пользователей: ${succeeded}.`,
      failed > 0 ? 'error' : 'success'
    )
    setLoading(false)
    setConfirmOpen(false)
    router.refresh()
  }

  if (uniqueUserIds.length === 0) return null

  return (
    <>
      <button
        type="button"
        className="btn-secondary w-full sm:w-auto"
        disabled={loading}
        onClick={() => setConfirmOpen(true)}
      >
        <RefreshCw className={loading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
        {loading ? `${processed} из ${uniqueUserIds.length}` : `Синхронизировать (${uniqueUserIds.length})`}
      </button>
      <ConfirmDialog
        open={confirmOpen}
        title="Синхронизировать показанных пользователей?"
        description={`Будут обновлены Telegram, Remnawave, подписки и устройства для ${uniqueUserIds.length} аккаунтов. Операция может занять несколько минут.`}
        confirmLabel="Запустить синхронизацию"
        loading={loading}
        tone="warning"
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => void syncShownUsers()}
      />
    </>
  )
}
