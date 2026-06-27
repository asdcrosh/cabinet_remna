'use client'

import { useEffect, useMemo } from 'react'
import { useSearchParams } from 'next/navigation'
import { Copy, ExternalLink } from 'lucide-react'
import { toast } from '@/components/ui/toaster'

const allowedSchemes = ['happ:', 'v2rayng:', 'v2rayn:', 'rabbithole:', 'rabbit-hole:']

export function AppOpenBridge() {
  const searchParams = useSearchParams()
  const targetUrl = searchParams.get('url') || ''
  const fallbackUrl = searchParams.get('fallback') || ''
  const appName = searchParams.get('app') || 'приложение'

  const isAllowed = useMemo(() => isAllowedAppUrl(targetUrl), [targetUrl])

  useEffect(() => {
    if (!isAllowed) return

    window.location.assign(targetUrl)
    if (fallbackUrl && fallbackUrl !== targetUrl && isAllowedAppUrl(fallbackUrl)) {
      window.setTimeout(() => window.location.assign(fallbackUrl), 900)
    }
  }, [fallbackUrl, isAllowed, targetUrl])

  async function copyUrl() {
    const url = extractSubscriptionUrl(targetUrl)
    if (!url) return
    try {
      await navigator.clipboard.writeText(url)
      toast('Ссылка подписки скопирована', 'success')
    } catch {
      toast('Не удалось скопировать ссылку')
    }
  }

  if (!isAllowed) {
    return (
      <main className="grid min-h-dvh place-items-center bg-slate-50 p-5 text-slate-950">
        <section className="w-full max-w-sm rounded-lg border border-red-100 bg-white p-5 text-center shadow-sm">
          <h1 className="text-lg font-semibold text-red-600">Некорректная ссылка</h1>
          <p className="mt-2 text-sm text-slate-500">Открытие этого адреса запрещено.</p>
        </section>
      </main>
    )
  }

  return (
    <main className="grid min-h-dvh place-items-center bg-slate-50 p-5 text-slate-950">
      <section className="w-full max-w-sm rounded-lg border border-slate-200 bg-white p-5 text-center shadow-sm">
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-lg bg-cyan-50 text-cyan-700">
          <ExternalLink className="h-6 w-6" />
        </div>
        <h1 className="mt-4 text-xl font-semibold">Открываем {appName}</h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          Если приложение не открылось, нажмите кнопку ниже или скопируйте ссылку подписки.
        </p>
        <div className="mt-5 grid gap-2">
          <a
            href={targetUrl}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white"
          >
            <ExternalLink className="h-4 w-4" />
            Открыть приложение
          </a>
          <button
            type="button"
            onClick={copyUrl}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-slate-200 px-4 text-sm font-semibold text-slate-700"
          >
            <Copy className="h-4 w-4" />
            Скопировать ссылку
          </button>
        </div>
      </section>
    </main>
  )
}

function isAllowedAppUrl(value: string) {
  if (!value || value.length > 4096) return false
  try {
    const url = new URL(value)
    return allowedSchemes.includes(url.protocol)
  } catch {
    return false
  }
}

function extractSubscriptionUrl(value: string) {
  if (!value) return ''
  if (value.startsWith('happ://add/')) return value.slice('happ://add/'.length)
  try {
    const url = new URL(value)
    return url.searchParams.get('url') || ''
  } catch {
    return ''
  }
}
