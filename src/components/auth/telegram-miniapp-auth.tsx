'use client'

import { useEffect, useState } from 'react'
import { Loader2, RefreshCw, Send, TriangleAlert } from 'lucide-react'
import { getTelegramLaunchData } from '@/lib/telegram-miniapp-client'
import { logError } from '@/lib/logger'
import { sanitizeInternalNext } from '@/lib/auth/next-path'

export function TelegramMiniAppAuth() {
  const [state, setState] = useState<'browser' | 'authenticating' | 'error'>('browser')
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false

    async function start() {
      const webApp = window.Telegram?.WebApp
      const launch = getTelegramLaunchData(window.location, webApp?.initData)

      if (!launch.isTelegram) {
        setState('browser')
        return
      }

      setState('authenticating')
      const initData = launch.initData

      webApp?.ready?.()
      webApp?.expand?.()
      try {
        const response = await fetch('/api/auth/telegram-miniapp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ initData }),
        })
        const data = await response.json().catch(() => null)
        if (!response.ok) throw new Error(data?.error || 'Telegram authentication failed')

        const sessionResponse = await fetch('/api/me', {
          cache: 'no-store',
          credentials: 'same-origin',
        })
        const sessionData = await sessionResponse.json().catch(() => null)
        if (!sessionResponse.ok || !sessionData?.user?.id) {
          throw new Error('Сессия не сохранилась. Проверьте домен APP_URL и cookies, затем откройте кабинет заново.')
        }

        window.location.replace(getSafeNextPath(window.location))
      } catch (error) {
        logError('telegram_miniapp.auth_failed', error)
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

function getSafeNextPath(location: Location) {
  const params = new URLSearchParams(location.search)
  const next = sanitizeInternalNext(params.get('next'), '')
  if (next) return stripTelegramSearchParams(next)

  if (!location.pathname.startsWith('/dashboard')) return '/dashboard'

  return stripTelegramSearchParams(`${location.pathname}${location.search}`)
}

function stripTelegramSearchParams(path: string) {
  const url = new URL(path, window.location.origin)
  for (const key of Array.from(url.searchParams.keys())) {
    if (key.startsWith('tgWebApp')) url.searchParams.delete(key)
  }

  return `${url.pathname}${url.search}`
}
