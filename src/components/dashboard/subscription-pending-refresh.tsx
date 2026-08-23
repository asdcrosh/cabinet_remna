'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export function SubscriptionPendingRefresh() {
  const router = useRouter()

  useEffect(() => {
    const timer = window.setInterval(() => router.refresh(), 3000)
    return () => window.clearInterval(timer)
  }, [router])

  return null
}
