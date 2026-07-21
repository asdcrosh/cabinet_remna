'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { RefreshCw } from 'lucide-react'

const INITIAL_DELAY_MS = 1000
const CHECK_INTERVAL_MS = 4000
const MAX_CHECKS = 15

export function PaymentLiveSync({ paymentIds }: { paymentIds: string[] }) {
  const router = useRouter()
  const idsKey = paymentIds.slice(0, 3).join(',')
  const [checking, setChecking] = useState(false)

  useEffect(() => {
    if (!idsKey) return

    const ids = idsKey.split(',')
    let canceled = false
    let checks = 0
    let timer: number | undefined

    const schedule = (delay: number) => {
      timer = window.setTimeout(check, delay)
    }

    const check = async () => {
      if (canceled) return
      if (document.visibilityState === 'hidden') {
        schedule(CHECK_INTERVAL_MS)
        return
      }

      checks += 1
      setChecking(true)
      const results = await Promise.all(
        ids.map(async (paymentId) => {
          try {
            const response = await fetch('/api/admin/payment-sync', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ paymentId, automatic: true }),
              cache: 'no-store',
            })
            const result = await response.json().catch(() => null) as {
              paymentStatus?: string
              provisioned?: boolean
            } | null
            return !response.ok || result?.paymentStatus !== 'PENDING' || result.provisioned === true
          } catch {
            return false
          }
        })
      )

      if (canceled) return
      setChecking(false)
      if (results.some(Boolean)) router.refresh()
      if (checks < MAX_CHECKS) schedule(CHECK_INTERVAL_MS)
    }

    schedule(INITIAL_DELAY_MS)
    return () => {
      canceled = true
      if (timer !== undefined) window.clearTimeout(timer)
    }
  }, [idsKey, router])

  if (!idsKey) return null

  return (
    <div className="flex justify-end" aria-live="polite">
      <span className="inline-flex items-center gap-1.5 rounded-full bg-cyan-50 px-2.5 py-1 text-xs font-medium text-cyan-700 ring-1 ring-cyan-200/70 dark:bg-cyan-400/10 dark:text-cyan-200 dark:ring-cyan-400/20">
        <RefreshCw className={`h-3.5 w-3.5 ${checking ? 'animate-spin' : ''}`} />
        {checking ? 'Проверяем новые оплаты' : 'Новые оплаты обновятся автоматически'}
      </span>
    </div>
  )
}
