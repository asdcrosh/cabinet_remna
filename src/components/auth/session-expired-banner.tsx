'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { LogIn, X } from 'lucide-react'
import { SESSION_EXPIRED_EVENT } from '@/lib/api-client'

export function SessionExpiredBanner() {
  const [next, setNext] = useState<string | null>(null)

  useEffect(() => {
    const show = (event: Event) => {
      const detail = (event as CustomEvent<{ next?: string }>).detail
      setNext(detail?.next || '/dashboard')
    }
    window.addEventListener(SESSION_EXPIRED_EVENT, show)
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, show)
  }, [])

  if (!next) return null

  return (
    <div className="fixed inset-x-3 top-3 z-[250] mx-auto max-w-xl rounded-2xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 shadow-xl dark:border-amber-500/40 dark:bg-slate-950 dark:text-amber-100" role="alert">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="font-semibold">Сессия истекла</div>
          <p className="mt-1 leading-5">
            Войдите в новой вкладке, затем вернитесь сюда и повторите действие. Введённые данные останутся на месте.
          </p>
          <Link
            href={`/login?next=${encodeURIComponent(next)}`}
            target="_blank"
            rel="noreferrer"
            className="btn-primary mt-3 min-h-10 px-3"
          >
            <LogIn className="h-4 w-4" />
            Открыть вход
          </Link>
        </div>
        <button
          type="button"
          className="rounded-lg p-1 text-amber-700 hover:bg-amber-100 dark:text-amber-200 dark:hover:bg-white/10"
          onClick={() => setNext(null)}
          aria-label="Скрыть сообщение"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
