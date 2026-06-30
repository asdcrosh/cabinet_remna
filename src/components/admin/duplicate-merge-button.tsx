'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { GitMerge } from 'lucide-react'
import { AdminModal } from '@/components/admin/admin-modal'
import { toast } from '@/components/ui/toaster'
import { apiFetch } from '@/lib/api-client'

export function DuplicateMergeButton({
  sourceUserId,
  targetUserId,
  sourceEmail,
  targetEmail,
}: {
  sourceUserId: string
  targetUserId: string
  sourceEmail: string
  targetEmail: string
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)

  async function mergeUsers() {
    setLoading(true)
    try {
      await apiFetch('/api/admin/users/merge', {
        method: 'POST',
        body: JSON.stringify({ sourceUserId, targetUserId }),
      })
      toast('Аккаунты объединены', 'success')
      setOpen(false)
      router.refresh()
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Не удалось объединить аккаунты')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <button type="button" className="btn-primary h-9 px-3" onClick={() => setOpen(true)}>
        <GitMerge className="h-4 w-4" />
        Объединить
      </button>
      <AdminModal
        open={open}
        title="Объединить аккаунты"
        description="Данные Telegram-аккаунта будут перенесены в email-аккаунт. Технический аккаунт будет обезличен."
        onClose={() => setOpen(false)}
      >
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <AccountPreview title="Откуда" email={sourceEmail} />
            <AccountPreview title="Куда" email={targetEmail} />
          </div>
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
            Проверьте пару перед объединением. Операция переносит платежи, подписки, устройства, обращения и историю начислений.
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" className="btn-secondary" onClick={() => setOpen(false)} disabled={loading}>
              Отмена
            </button>
            <button type="button" className="btn-primary" onClick={() => void mergeUsers()} disabled={loading}>
              {loading ? 'Объединяем...' : 'Объединить'}
            </button>
          </div>
        </div>
      </AdminModal>
    </>
  )
}

function AccountPreview({ title, email }: { title: string; email: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 dark:border-white/10 dark:bg-white/[0.04]">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">{title}</div>
      <div className="mt-1 truncate text-sm font-semibold text-slate-950 dark:text-white">{email}</div>
    </div>
  )
}
