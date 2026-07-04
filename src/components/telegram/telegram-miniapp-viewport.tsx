'use client'

import { useEffect } from 'react'

export function TelegramMiniAppViewport() {
  useEffect(() => {
    const webApp = window.Telegram?.WebApp
    if (!webApp) return

    const syncViewport = () => {
      if (webApp.viewportHeight) {
        document.documentElement.style.setProperty('--tg-viewport-height', `${webApp.viewportHeight}px`)
      }
      if (webApp.viewportStableHeight) {
        document.documentElement.style.setProperty('--tg-viewport-stable-height', `${webApp.viewportStableHeight}px`)
      }
    }

    webApp.ready?.()
    webApp.expand?.()
    syncViewport()
    webApp.onEvent?.('viewportChanged', syncViewport)

    return () => {
      webApp.offEvent?.('viewportChanged', syncViewport)
    }
  }, [])

  return null
}
