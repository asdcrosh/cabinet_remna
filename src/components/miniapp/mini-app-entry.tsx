'use client'

import { useEffect, useState } from 'react'
import { getTelegramLaunchData } from '@/lib/telegram-miniapp-client'
import { miniAppDestination } from '@/lib/miniapp/destination'

const steps = ['Проверяем подпись Telegram', 'Входим в кабинет', 'Загружаем ваш раздел']

export function MiniAppEntry() {
  const [error, setError] = useState('')
  const [step, setStep] = useState(0)

  useEffect(() => {
    let cancelled = false
    async function enter() {
      try {
        let launch = getTelegramLaunchData(window.location, window.Telegram?.WebApp?.initData)
        if (!launch.isTelegram && window.location.href.includes('tgWebAppVersion=')) {
          await new Promise<void>(resolve => {
            const timeout = window.setTimeout(resolve, 4000)
            window.addEventListener('telegram-web-app-ready', () => { clearTimeout(timeout); resolve() }, { once: true })
          })
          launch = getTelegramLaunchData(window.location, window.Telegram?.WebApp?.initData)
        }
        if (cancelled) return
        if (launch.isTelegram) {
          setStep(1)
          const start = new URLSearchParams(launch.initData).get('start_param')?.match(/^ref_([A-Z0-9]{6,8})$/)?.[1]
          const referralCode = start || new URLSearchParams(window.location.search).get('ref')
          const response = await fetch('/api/miniapp/auth', {
            method: 'POST', credentials: 'same-origin', cache: 'no-store',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ initData: launch.initData, referralCode }),
          })
          const result = await response.json()
          if (!response.ok) throw new Error(result.error || 'Не удалось войти через Telegram')
        }
        if (cancelled) return
        setStep(2)
        const section = new URLSearchParams(window.location.search).get('tab')
        window.location.replace(miniAppDestination(section))
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : 'Не удалось открыть кабинет')
      }
    }
    void enter()
    return () => { cancelled = true }
  }, [])

  return <main className="relative grid min-h-dvh place-items-center overflow-hidden bg-[#0a0c0d] px-5 text-slate-100">
    <div aria-hidden className="pointer-events-none absolute -top-32 left-1/2 h-80 w-80 -translate-x-1/2 rounded-full bg-cyan-400/20 blur-[110px]" />
    <div aria-hidden className="pointer-events-none absolute -bottom-40 right-[-10%] h-96 w-96 rounded-full bg-emerald-400/10 blur-[130px]" />

    <div className="relative w-full max-w-sm rounded-3xl border border-white/10 bg-white/[0.04] p-7 shadow-[0_24px_80px_-24px_rgba(0,0,0,0.8)] backdrop-blur">
      <div className="flex items-center gap-3">
        <span className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-cyan-400 to-emerald-400 text-lg font-black text-[#06251f] shadow-[0_8px_24px_-6px_rgba(34,211,238,0.5)]">A</span>
        <div>
          <p className="text-sm font-bold tracking-tight">AlekseevVP</p>
          <p className="text-xs text-slate-400">Ваш интернет. Ваши правила.</p>
        </div>
      </div>

      {error ? <>
        <h1 className="mt-6 text-xl font-semibold tracking-tight">Не удалось открыть кабинет</h1>
        <p className="mt-2 text-sm leading-6 text-slate-400">{error}</p>
        <button className="btn-primary mt-6 w-full" onClick={() => window.location.reload()}>Повторить</button>
      </> : <>
        <h1 className="mt-6 text-xl font-semibold tracking-tight">Открываем кабинет</h1>
        <ul className="mt-4 space-y-2.5">
          {steps.map((label, index) => {
            const done = index < step
            const active = index === step
            return <li key={label} className={`flex items-center gap-2.5 text-sm transition-colors ${done ? 'text-emerald-300' : active ? 'text-slate-100' : 'text-slate-500'}`}>
              <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border text-[10px] font-bold ${done ? 'border-emerald-400/50 bg-emerald-400/15' : active ? 'border-cyan-300/60 bg-cyan-400/15' : 'border-white/10'}`}>
                {done ? '✓' : index + 1}
              </span>
              {label}
              {active && <span className="ml-1 inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-cyan-300/30 border-t-cyan-300" />}
            </li>
          })}
        </ul>
        <div className="mt-6 h-1 overflow-hidden rounded-full bg-white/10">
          <div className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-emerald-400 transition-all duration-500" style={{ width: `${((step + 1) / steps.length) * 100}%` }} />
        </div>
      </>}
    </div>
  </main>
}
