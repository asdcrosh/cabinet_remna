'use client'

import { useEffect } from 'react'

export function TelegramMiniAppViewport() {
  useEffect(() => {
    let cleanup: (() => void) | undefined

    const initialize = () => {
      cleanup?.()
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
      cleanup = () => {
        webApp.offEvent?.('viewportChanged', syncViewport)
      }
    }

    initialize()
    window.addEventListener('telegram-web-app-ready', initialize)

    return () => {
      window.removeEventListener('telegram-web-app-ready', initialize)
      cleanup?.()
    }
  }, [])

  return null
}
