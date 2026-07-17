'use client'

import { useState } from 'react'
import { Check, Copy, Send } from 'lucide-react'
import { toast } from '@/components/ui/toaster'

export function ReferralLinkCard({
  code,
  url,
  bonusDays,
}: {
  code: string
  url: string
  bonusDays: number
}) {
  const [copied, setCopied] = useState(false)

  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      toast('Ссылка скопирована', 'success')
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      toast('Не удалось скопировать ссылку', 'error')
    }
  }

  async function share() {
    const text = `Присоединяйся по моей ссылке. После первой покупки я получу +${bonusDays} дн. подписки.`
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Приглашение',
          text,
          url,
        })
        return
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return
      }
    }
    await copy(url)
  }

  return (
    <div className="w-full max-w-full overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-white/[0.035] sm:p-5">
      <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0 max-w-full">
          <div className="flex min-w-0 items-center gap-2 text-sm text-slate-500">
            <span className="font-semibold text-slate-950 dark:text-white">Ваша ссылка</span>
            <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-200">+{bonusDays} дней</span>
          </div>
          <div className="mt-3 flex min-w-0 max-w-full items-center gap-2 overflow-hidden rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 dark:border-white/10 dark:bg-surface-950/70">
            <div className="min-w-0 flex-1 overflow-hidden truncate font-mono text-xs text-slate-600 dark:text-slate-300 sm:text-sm">{url}</div>
            <button
              type="button"
              className="grid h-11 w-11 shrink-0 place-items-center rounded-lg text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white"
              onClick={() => copy(url)}
              aria-label="Копировать ссылку"
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </button>
          </div>
          <div className="mt-2 flex min-w-0 flex-wrap items-center gap-2 text-xs text-slate-500">
            <span>Код</span>
            <span className="rounded-full bg-slate-100 px-2 py-1 font-mono font-semibold text-slate-800 dark:bg-white/10 dark:text-white">{code}</span>
            <span className="min-w-0">Бонус начислится после первой оплаты друга</span>
          </div>
        </div>
        <div className="min-w-0 max-w-full lg:w-auto">
          <button type="button" className="btn-primary" onClick={share}>
            <Send className="h-4 w-4" />
            Поделиться
          </button>
        </div>
      </div>
    </div>
  )
}
