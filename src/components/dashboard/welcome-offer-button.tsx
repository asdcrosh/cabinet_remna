'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Gift, Sparkles, Ticket, WandSparkles, X } from 'lucide-react'
import { apiFetch } from '@/lib/api-client'
import { toast } from '@/components/ui/toaster'

type WelcomeBonusChoice = {
  type: 'TRIAL_PLAN' | 'BONUS_BOX_ATTEMPTS' | 'PROMO_CODE'
  title: string
  description: string
}

export function WelcomeOfferButton({ label, options }: { label: string; options: WelcomeBonusChoice[] }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)

  async function claim(type: WelcomeBonusChoice['type']) {
    setLoading(true)
    try {
      const result = await apiFetch<{
        type: WelcomeBonusChoice['type']
        redirectUrl: string
        message: string
      }>('/api/offers/welcome/claim', {
        method: 'POST',
        body: JSON.stringify({ type }),
      })
      toast(result.message, 'success')
      setOpen(false)
      router.push(result.redirectUrl)
      router.refresh()
    } finally {
      setLoading(false)
    }
  }

  function onPrimaryClick() {
    if (options.length === 1) {
      void claim(options[0].type)
      return
    }
    setOpen(true)
  }

  if (options.length === 0) return null

  return (
    <>
      <button
        type="button"
        className="btn-primary min-h-11 shrink-0 justify-center px-4"
        onClick={onPrimaryClick}
        disabled={loading}
      >
        <Sparkles className="h-4 w-4" />
        {loading ? 'Начисляем...' : label}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl dark:border-white/10 dark:bg-surface-950">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-slate-950 dark:text-white">Выберите приветственный бонус</h3>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Можно получить только один вариант.</p>
              </div>
              <button type="button" className="icon-button" onClick={() => setOpen(false)} disabled={loading} aria-label="Закрыть">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-4 grid gap-2">
              {options.map((option) => (
                <button
                  key={option.type}
                  type="button"
                  className="flex min-h-20 items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 text-left transition hover:border-cyan-200 hover:bg-cyan-50 dark:border-white/10 dark:bg-white/[0.03] dark:hover:bg-cyan-500/10"
                  onClick={() => void claim(option.type)}
                  disabled={loading}
                >
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-cyan-50 text-cyan-700 dark:bg-cyan-500/10 dark:text-cyan-200">
                    {welcomeIcon(option.type)}
                  </span>
                  <span className="min-w-0">
                    <span className="block font-semibold text-slate-950 dark:text-white">{option.title}</span>
                    <span className="block text-sm text-slate-500 dark:text-slate-400">{option.description}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function welcomeIcon(type: WelcomeBonusChoice['type']) {
  if (type === 'PROMO_CODE') return <Ticket className="h-5 w-5" />
  if (type === 'BONUS_BOX_ATTEMPTS') return <WandSparkles className="h-5 w-5" />
  return <Gift className="h-5 w-5" />
}
