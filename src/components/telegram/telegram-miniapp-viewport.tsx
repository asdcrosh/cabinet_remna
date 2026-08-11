'use client'

import { useEffect } from 'react'
import {
  markTelegramMiniApp,
  prepareTelegramMiniApp,
  syncTelegramMiniAppInsets,
} from '@/lib/telegram-miniapp-viewport'

const VIEWPORT_EVENTS = [
  'viewportChanged',
  'safeAreaChanged',
  'contentSafeAreaChanged',
  'fullscreenChanged',
] as const

export function TelegramMiniAppViewport() {
  useEffect(() => {
    let cleanup: (() => void) | undefined

    const initialize = () => {
      cleanup?.()
      const webApp = window.Telegram?.WebApp
      if (!webApp) return

      markTelegramMiniApp(document.documentElement)

      const syncViewport = () => {
        if (webApp.viewportHeight) {
          document.documentElement.style.setProperty('--tg-viewport-height', `${webApp.viewportHeight}px`)
        }
        if (webApp.viewportStableHeight) {
          document.documentElement.style.setProperty('--tg-viewport-stable-height', `${webApp.viewportStableHeight}px`)
        }
        syncTelegramMiniAppInsets(webApp, document.documentElement.style)
      }

      prepareTelegramMiniApp(webApp)
      syncViewport()
      for (const event of VIEWPORT_EVENTS) {
        webApp.onEvent?.(event, syncViewport)
      }
      cleanup = () => {
        for (const event of VIEWPORT_EVENTS) {
          webApp.offEvent?.(event, syncViewport)
        }
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
