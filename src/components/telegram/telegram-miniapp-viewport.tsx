'use client'

import { useEffect } from 'react'
import {
  applyTelegramColorScheme,
  cssColorToHex,
  markTelegramMiniApp,
  prepareTelegramMiniApp,
  syncTelegramMiniAppColors,
  syncTelegramMiniAppInsets,
  TELEGRAM_COLOR_SCHEME_KEY,
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

      const root = document.documentElement
      markTelegramMiniApp(root)

      const syncViewport = () => {
        if (webApp.viewportHeight) {
          root.style.setProperty('--tg-viewport-height', `${webApp.viewportHeight}px`)
        }
        if (webApp.viewportStableHeight) {
          root.style.setProperty('--tg-viewport-stable-height', `${webApp.viewportStableHeight}px`)
        }
        syncTelegramMiniAppInsets(webApp, root.style)
      }

      const syncTheme = () => {
        const scheme = applyTelegramColorScheme(root, webApp.colorScheme)
        if (scheme) {
          try {
            window.sessionStorage.setItem(TELEGRAM_COLOR_SCHEME_KEY, scheme)
          } catch {
            // Хранилище может быть недоступно во встроенном браузере.
          }
        }
        // Фон берём из уже применённой темы, чтобы не дублировать палитру в коде.
        syncTelegramMiniAppColors(webApp, cssColorToHex(getComputedStyle(document.body).backgroundColor))
      }

      prepareTelegramMiniApp(webApp)
      syncTheme()
      syncViewport()
      for (const event of VIEWPORT_EVENTS) {
        webApp.onEvent?.(event, syncViewport)
      }
      webApp.onEvent?.('themeChanged', syncTheme)
      cleanup = () => {
        for (const event of VIEWPORT_EVENTS) {
          webApp.offEvent?.(event, syncViewport)
        }
        webApp.offEvent?.('themeChanged', syncTheme)
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
