'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { getTelegramBackTarget } from '@/lib/telegram-back-navigation'

type TelegramBackButtonApi = NonNullable<NonNullable<NonNullable<Window['Telegram']>['WebApp']>['BackButton']>

/** Показывает системную кнопку «Назад» Telegram на вложенных страницах кабинета. */
export function TelegramBackButton() {
  const pathname = usePathname()
  const router = useRouter()
  const backButton = useTelegramBackButton()
  const target = getTelegramBackTarget(pathname)

  useEffect(() => {
    if (!backButton) return
    if (!target) {
      backButton.hide()
      return
    }

    const goBack = () => router.push(target)
    backButton.onClick(goBack)
    backButton.show()
    return () => {
      backButton.offClick(goBack)
    }
  }, [backButton, router, target])

  useEffect(() => () => backButton?.hide(), [backButton])

  return null
}

export function useTelegramBackButton() {
  const [backButton, setBackButton] = useState<TelegramBackButtonApi | null>(null)

  useEffect(() => {
    const resolve = () => {
      const webApp = window.Telegram?.WebApp
      // BackButton появился в Bot API 6.1; на старых клиентах методы есть, но не работают.
      if (!webApp?.initData || !webApp.BackButton || webApp.isVersionAtLeast?.('6.1') !== true) return
      setBackButton(webApp.BackButton)
    }
    resolve()
    window.addEventListener('telegram-web-app-ready', resolve)
    return () => window.removeEventListener('telegram-web-app-ready', resolve)
  }, [])

  return backButton
}
