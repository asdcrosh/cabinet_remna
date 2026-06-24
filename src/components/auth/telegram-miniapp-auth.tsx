'use client'

import { useEffect, useState } from 'react'
import { Loader2, RefreshCw, Send, TriangleAlert } from 'lucide-react'
import { getTelegramLaunchData } from '@/lib/telegram-miniapp-client'

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
  const [state, setState] = useState<'checking' | 'browser' | 'authenticating' | 'error'>('checking')
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    let attempts = 0
    let retryTimer: number | undefined

    async function start() {
      const webApp = window.Telegram?.WebApp
      const launch = getTelegramLaunchData(window.location, webApp?.initData)

      if (!launch.isTelegram) {
        setState('browser')
        return
      }

      setState('authenticating')
      const initData = launch.initData
      if (!initData) {
        attempts += 1
        if (attempts < 100 && !cancelled) {
          retryTimer = window.setTimeout(start, 150)
          return
        }
        setError('Telegram не передал данные для входа. Закройте это окно и откройте кабинет заново из меню бота.')
        setState('error')
        return
      }

      webApp?.ready?.()
      webApp?.expand?.()
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
        if (!cancelled) {
          setError(
            error instanceof Error && error.message
              ? error.message
              : 'Не удалось войти через Telegram. Попробуйте открыть кабинет заново.'
          )
          setState('error')
        }
      }
    }

    void start()
    return () => {
      cancelled = true
      if (retryTimer) window.clearTimeout(retryTimer)
    }
  }, [])

  if (state === 'browser') return null

  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-slate-50 px-5 dark:bg-surface-950">
      <div className="w-full max-w-sm text-center">
        <div
          className={`mx-auto grid h-14 w-14 place-items-center rounded-lg ${
            state === 'error'
              ? 'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-300'
              : 'bg-sky-100 text-sky-600 dark:bg-sky-500/10 dark:text-sky-300'
          }`}
        >
          {state === 'error' ? <TriangleAlert className="h-7 w-7" /> : <Send className="h-7 w-7" />}
        </div>
        {state === 'error' ? (
          <>
            <h1 className="mt-4 text-lg font-semibold">Не удалось войти через Telegram</h1>
            <p className="mt-2 text-sm leading-6 text-slate-500">{error}</p>
            <button type="button" className="btn-secondary mt-5 w-full" onClick={() => window.location.reload()}>
              <RefreshCw className="h-4 w-4" />
              Повторить
            </button>
          </>
        ) : (
          <div className="mt-4 flex items-center justify-center gap-2 font-semibold">
            <Loader2 className="h-4 w-4 animate-spin" />
            Входим через Telegram
          </div>
        )}
      </div>
    </div>
  )
}
