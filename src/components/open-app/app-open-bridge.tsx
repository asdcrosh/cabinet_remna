'use client'

import type { ReactNode } from 'react'
import { useEffect, useMemo } from 'react'
import { useSearchParams } from 'next/navigation'
import { ArrowLeft, Check, Copy, ExternalLink, ShieldAlert, ShieldCheck } from 'lucide-react'
import { toast } from '@/components/ui/toaster'

const allowedSchemes = ['happ:', 'v2rayng:', 'v2rayn:', 'rabbithole:', 'rabbit-hole:']

export function AppOpenBridge({ brandName }: { brandName: string }) {
  const searchParams = useSearchParams()
  const targetUrl = searchParams.get('url') || ''
  const fallbackUrl = searchParams.get('fallback') || ''
  const appName = normalizeAppName(searchParams.get('app'))

  const isAllowed = useMemo(() => isAllowedAppUrl(targetUrl), [targetUrl])
  const safeFallbackUrl = useMemo(
    () => fallbackUrl && fallbackUrl !== targetUrl && isAllowedAppUrl(fallbackUrl) ? fallbackUrl : '',
    [fallbackUrl, targetUrl],
  )
  const subscriptionUrl = useMemo(() => extractSubscriptionUrl(targetUrl), [targetUrl])

  useEffect(() => {
    if (!isAllowed) return

    window.location.assign(targetUrl)
    if (safeFallbackUrl) {
      window.setTimeout(() => window.location.assign(safeFallbackUrl), 900)
    }
  }, [isAllowed, safeFallbackUrl, targetUrl])

  async function copyUrl() {
    if (!subscriptionUrl) return
    try {
      await navigator.clipboard.writeText(subscriptionUrl)
      toast('Ссылка подписки скопирована', 'success')
    } catch {
      toast('Не удалось скопировать ссылку')
    }
  }

  if (!isAllowed) {
    return (
      <OpenAppLayout brandName={brandName}>
        <section className="overflow-hidden rounded-[2rem] border border-rose-200/80 bg-white/95 shadow-[0_24px_70px_-32px_rgba(15,23,42,0.35)] backdrop-blur dark:border-rose-500/20 dark:bg-slate-900/95">
          <div className="px-5 py-6 text-center sm:px-7 sm:py-8">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-rose-50 text-rose-600 ring-1 ring-rose-200/80 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-500/20">
              <ShieldAlert className="h-7 w-7" aria-hidden="true" />
            </div>
            <div className="mx-auto mt-4 inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700 ring-1 ring-rose-200/80 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-500/20">
              Ссылка отклонена
            </div>
            <h1 className="mt-4 text-xl font-semibold tracking-tight text-slate-950 dark:text-white sm:text-2xl">
              Не удалось открыть приложение
            </h1>
            <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-slate-500 dark:text-slate-400">
              Ссылка недействительна или использует неподдерживаемый протокол. Вернитесь к подписке и повторите запуск.
            </p>
            <a
              href="/dashboard/subscription"
              className="mt-6 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:ring-offset-2 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200 dark:focus-visible:ring-offset-slate-900"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Вернуться к подписке
            </a>
          </div>
          <div className="border-t border-slate-200/80 bg-slate-50/80 px-5 py-3.5 text-center text-xs leading-5 text-slate-500 dark:border-white/[0.08] dark:bg-white/[0.025] dark:text-slate-400">
            Адрес не был открыт и не передан внешнему приложению.
          </div>
        </section>
      </OpenAppLayout>
    )
  }

  return (
    <OpenAppLayout brandName={brandName}>
      <section className="overflow-hidden rounded-[2rem] border border-slate-200/80 bg-white/95 shadow-[0_24px_70px_-32px_rgba(15,23,42,0.35)] backdrop-blur dark:border-white/[0.1] dark:bg-slate-900/95">
        <div className="px-5 py-6 text-center sm:px-7 sm:py-8">
          <div className="mx-auto inline-flex items-center gap-2 rounded-full bg-cyan-50 px-3 py-1.5 text-xs font-semibold text-cyan-700 ring-1 ring-cyan-200/80 dark:bg-cyan-500/10 dark:text-cyan-300 dark:ring-cyan-500/20">
            <span className="h-2 w-2 rounded-full bg-cyan-500" />
            Автоматическое открытие
          </div>
          <div className="mx-auto mt-5 grid h-16 w-16 place-items-center rounded-[1.4rem] bg-slate-950 text-white shadow-lg shadow-slate-950/15 dark:bg-white dark:text-slate-950">
            <ExternalLink className="h-7 w-7" aria-hidden="true" />
          </div>
          <h1 className="mt-5 text-xl font-semibold tracking-tight text-slate-950 dark:text-white sm:text-2xl">
            Открываем {appName}
          </h1>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-slate-500 dark:text-slate-400">
            Запрос на запуск уже отправлен. Если приложение не открылось, повторите вручную или скопируйте ссылку подписки.
          </p>
          {safeFallbackUrl ? (
            <p className="mx-auto mt-2 max-w-sm text-xs leading-5 text-slate-400 dark:text-slate-500">
              Через секунду также попробуем совместимый способ открытия.
            </p>
          ) : null}
          <div className="mt-6 grid gap-2.5">
            <a
              href={targetUrl}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:ring-offset-2 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200 dark:focus-visible:ring-offset-slate-900"
            >
              <ExternalLink className="h-4 w-4" aria-hidden="true" />
              Открыть {appName}
            </a>
            {subscriptionUrl ? (
              <button
                type="button"
                onClick={copyUrl}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:ring-offset-2 dark:border-white/10 dark:bg-white/[0.035] dark:text-slate-200 dark:hover:bg-white/[0.07] dark:focus-visible:ring-offset-slate-900"
              >
                <Copy className="h-4 w-4" aria-hidden="true" />
                Скопировать ссылку
              </button>
            ) : null}
          </div>
        </div>
        <div className="flex items-start gap-3 border-t border-slate-200/80 bg-slate-50/80 px-5 py-4 text-left dark:border-white/[0.08] dark:bg-white/[0.025] sm:px-7">
          <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
            <Check className="h-3.5 w-3.5" aria-hidden="true" />
          </span>
          <div>
            <div className="text-xs font-semibold text-slate-700 dark:text-slate-200">Ссылка проверена</div>
            <div className="mt-0.5 text-xs leading-5 text-slate-500 dark:text-slate-400">Открываем только разрешённые схемы VPN-приложений.</div>
          </div>
        </div>
      </section>
    </OpenAppLayout>
  )
}

function OpenAppLayout({ brandName, children }: { brandName: string; children: ReactNode }) {
  return (
    <main className="relative isolate grid min-h-dvh place-items-center overflow-hidden bg-slate-50 px-4 py-8 text-slate-950 dark:bg-slate-950 dark:text-white sm:p-8">
      <div className="pointer-events-none absolute inset-0 -z-10" aria-hidden="true">
        <div className="absolute left-1/2 top-[-12rem] h-80 w-80 -translate-x-1/2 rounded-full bg-cyan-200/35 blur-3xl dark:bg-cyan-500/10" />
        <div className="absolute bottom-[-10rem] right-[-8rem] h-72 w-72 rounded-full bg-slate-200/70 blur-3xl dark:bg-slate-700/20" />
      </div>
      <div className="w-full max-w-md">
        <div className="mb-4 flex min-w-0 items-center justify-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-white text-cyan-600 shadow-sm ring-1 ring-slate-200/80 dark:bg-white/[0.06] dark:text-cyan-300 dark:ring-white/10">
            <ShieldCheck className="h-4 w-4" aria-hidden="true" />
          </span>
          <span className="truncate">{brandName}</span>
        </div>
        {children}
      </div>
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

function normalizeAppName(value: string | null) {
  const normalized = value?.replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, 48)
  return normalized || 'приложение'
}
