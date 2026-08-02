'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'
import { apiFetch } from '@/lib/api-client'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { toast } from '@/components/ui/toaster'

export function UserSubscriptionDeleteButton({
  userId,
  email,
  showLabel = false,
}: {
  userId: string
  email: string
  showLabel?: boolean
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)

  async function removeSubscription() {
    setLoading(true)
    try {
      await apiFetch(`/api/admin/users/${userId}/plan`, { method: 'DELETE' })
      toast('Подписка удалена', 'success')
      setOpen(false)
      router.refresh()
    } catch {
      // apiFetch already shows a toast.
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <button
        type="button"
        className={`btn-secondary h-10 min-h-10 shrink-0 text-red-600 hover:text-red-700 dark:text-red-300 dark:hover:text-red-200 ${showLabel ? 'px-3' : 'w-10 px-0'}`}
        onClick={() => setOpen(true)}
        title="Удалить подписку"
        aria-label="Удалить подписку"
      >
        <Trash2 className="h-4 w-4" />
        {showLabel ? <span>Удалить подписку</span> : null}
      </button>

      <ConfirmDialog
        open={open}
        title="Удалить подписку?"
        description={`Доступ ${email} отключится сразу на всех устройствах. Платежи и аккаунт останутся в истории.`}
        confirmLabel="Удалить"
        loading={loading}
        onCancel={() => setOpen(false)}
        onConfirm={removeSubscription}
      />
    </>
  )
}
