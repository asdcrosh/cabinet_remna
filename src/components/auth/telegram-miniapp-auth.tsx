'use client'

import { useEffect, useState } from 'react'
import { Loader2, Send } from 'lucide-react'

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        initData?: string
        ready?: () => void
        expand?: () => void
      }
    }
  }
}

export function TelegramMiniAppAuth() {
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let cancelled = false
    let attempts = 0

    async function start() {
      const webApp = window.Telegram?.WebApp
      const initData = webApp?.initData
      if (!initData) {
        attempts += 1
        if (attempts < 20 && !cancelled) window.setTimeout(start, 100)
        return
      }

      setLoading(true)
      webApp.ready?.()
      webApp.expand?.()
      try {
        const response = await fetch('/api/auth/telegram-miniapp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ initData }),
        })
        const data = await response.json().catch(() => null)
        if (!response.ok) throw new Error(data?.error || 'Telegram authentication failed')
        window.location.replace(data.requiresEmailVerification ? '/telegram-email' : '/dashboard')
      } catch (error) {
        console.error('[telegram-miniapp] auth failed', error)
        if (!cancelled) setLoading(false)
      }
    }

    void start()
    return () => {
      cancelled = true
    }
  }, [])

  if (!loading) return null
  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-slate-50 px-5 dark:bg-surface-950">
      <div className="text-center">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-lg bg-sky-100 text-sky-600 dark:bg-sky-500/10 dark:text-sky-300">
          <Send className="h-7 w-7" />
        </div>
        <div className="mt-4 flex items-center justify-center gap-2 font-semibold">
          <Loader2 className="h-4 w-4 animate-spin" />
          Входим через Telegram
        </div>
      </div>
    </div>
  )
}
