'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { getTelegramLaunchData } from '@/lib/telegram-miniapp-client'

type TelegramWindow = Window & {
  Telegram?: {
    WebApp?: {
      initData?: string
    }
  }
}

export function TelegramWebAppOpenTracker() {
  const router = useRouter()

  useEffect(() => {
    const telegramWindow = window as TelegramWindow
    const launchData = getTelegramLaunchData(
      { hash: window.location.hash, search: window.location.search },
      telegramWindow.Telegram?.WebApp?.initData ?? ''
    )
    if (!launchData.isTelegram) return

    const key = `telegram-webapp-open:${new Date().toISOString().slice(0, 10)}`
    if (sessionStorage.getItem(key)) return
    sessionStorage.setItem(key, '1')

    void fetch('/api/missions/telegram-open', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    })
      .then((response) => {
        if (response.ok) router.refresh()
      })
      .catch(() => {
        sessionStorage.removeItem(key)
      })
  }, [router])

  return null
}
