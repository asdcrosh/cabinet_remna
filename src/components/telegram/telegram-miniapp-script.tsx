'use client'

import { useEffect } from 'react'

const SESSION_KEY = 'remnawave-cabinet:telegram-miniapp'
const SCRIPT_ID = 'telegram-web-app-sdk'

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

    if (window.Telegram?.WebApp) {
      window.dispatchEvent(new Event('telegram-web-app-ready'))
      return
    }
    if (document.getElementById(SCRIPT_ID)) return

    const script = document.createElement('script')
    script.id = SCRIPT_ID
    script.src = 'https://telegram.org/js/telegram-web-app.js?62'
    script.async = true
    script.addEventListener('load', () => {
      window.dispatchEvent(new Event('telegram-web-app-ready'))
    }, { once: true })
    document.head.appendChild(script)
  }, [])

  return null
}
