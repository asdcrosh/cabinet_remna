'use client'

import { useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { apiFetch } from '@/lib/api-client'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/toaster'

type SyncUser = { id: string; label: string }

export function BulkUserSyncButton({ users }: { users: SyncUser[] }) {
  const router = useRouter()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [processed, setProcessed] = useState(0)
  const [failedUsers, setFailedUsers] = useState<SyncUser[]>([])
  const [lastSucceeded, setLastSucceeded] = useState(0)
  const uniqueUsers = Array.from(new Map(users.map((user) => [user.id, user])).values()).slice(0, 50)

  async function syncUsers(targetUsers: SyncUser[]) {
    setLoading(true)
    setProcessed(0)
    setFailedUsers([])
    let succeeded = 0
    const failed: SyncUser[] = []

    for (const user of targetUsers) {
      try {
        await apiFetch(`/api/admin/users/${user.id}/sync`, {
          method: 'POST',
          headers: { 'x-error-presentation': 'silent' },
        })
        succeeded += 1
      } catch {
        failed.push(user)
      } finally {
        setProcessed((value) => value + 1)
      }
    }

    setLastSucceeded(succeeded)
    setFailedUsers(failed)
    if (failed.length === 0) toast(`Синхронизировано пользователей: ${succeeded}.`, 'success')
    setLoading(false)
    setConfirmOpen(false)
    router.refresh()
  }

  if (uniqueUsers.length === 0) return null

  return (
    <>
      <button
        type="button"
        className="btn-secondary w-full sm:w-auto"
        disabled={loading}
        onClick={() => setConfirmOpen(true)}
      >
        <RefreshCw className={loading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
        {loading ? `${processed} из ${uniqueUsers.length}` : `Синхронизировать (${uniqueUsers.length})`}
      </button>
      <ConfirmDialog
        open={confirmOpen}
        title="Синхронизировать показанных пользователей?"
        description={`Будут обновлены Telegram, Remnawave, подписки и устройства для ${uniqueUsers.length} аккаунтов. Операция может занять несколько минут.`}
        confirmLabel="Запустить синхронизацию"
        loading={loading}
        tone="warning"
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => void syncUsers(uniqueUsers)}
      />
      <Modal
        open={failedUsers.length > 0}
        title="Не все аккаунты синхронизированы"
        description={`Успешно: ${lastSucceeded}. Требуют повтора: ${failedUsers.length}.`}
        onClose={() => setFailedUsers([])}
        footer={(
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={() => setFailedUsers([])}>Закрыть</Button>
            <Button disabled={loading} onClick={() => void syncUsers(failedUsers)}>
              <RefreshCw className={loading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
              {loading ? `${processed} из ${failedUsers.length}` : 'Повторить ошибки'}
            </Button>
          </div>
        )}
      >
        <p className="text-sm text-slate-600 dark:text-slate-300">Проверьте эти аккаунты или запустите повтор:</p>
        <ul className="mt-3 divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 dark:divide-white/10 dark:border-white/10">
          {failedUsers.map((user) => (
            <li key={user.id} className="break-all px-3 py-2.5 text-sm font-medium text-slate-800 dark:text-slate-100">
              {user.label}
            </li>
          ))}
        </ul>
      </Modal>
    </>
  )
}
