'use client'

import { useEffect } from 'react'
import { loadTelegramMiniAppSdk } from '@/lib/telegram-miniapp-client'
import { markTelegramMiniApp } from '@/lib/telegram-miniapp-viewport'

const SESSION_KEY = 'remnawave-cabinet:telegram-miniapp'

export function TelegramMiniAppScript() {
  useEffect(() => {
    const launchData = `${window.location.search}${window.location.hash}`
    const isTelegramLaunch = launchData.includes('tgWebAppData=') || launchData.includes('tgWebAppVersion=')
    let rememberedLaunch = false
    try {
      if (isTelegramLaunch) window.sessionStorage.setItem(SESSION_KEY, '1')
      rememberedLaunch = window.sessionStorage.getItem(SESSION_KEY) === '1'
    } catch {
      rememberedLaunch = isTelegramLaunch
    }
    if (!rememberedLaunch) return

    markTelegramMiniApp(document.documentElement)

    void loadTelegramMiniAppSdk()
  }, [])

  return null
}
