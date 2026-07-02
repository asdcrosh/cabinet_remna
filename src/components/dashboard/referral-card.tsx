'use client'

import { useState } from 'react'
import { Check, Copy, Send, Sparkles } from 'lucide-react'
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
    <div className="rounded-lg border border-cyan-100 bg-white/95 p-3 shadow-sm shadow-cyan-100/40 dark:border-cyan-400/15 dark:bg-white/[0.04] dark:shadow-none sm:p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-950 dark:text-white">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-cyan-50 text-cyan-700 dark:bg-cyan-400/10 dark:text-cyan-200">
              <Sparkles className="h-4 w-4" />
            </span>
            Пригласите друга
          </div>
          <div className="mt-3 flex min-w-0 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 dark:border-white/10 dark:bg-surface-950/70">
            <div className="min-w-0 flex-1 truncate font-mono text-xs text-slate-600 dark:text-slate-300 sm:text-sm">{url}</div>
            <button
              type="button"
              className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-white text-slate-600 shadow-sm ring-1 ring-slate-200 transition hover:text-slate-950 dark:bg-white/10 dark:text-slate-300 dark:ring-white/10 dark:hover:text-white"
              onClick={() => copy(url)}
              aria-label="Копировать ссылку"
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </button>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span>Код</span>
            <span className="rounded-full bg-slate-100 px-2 py-1 font-mono font-semibold text-slate-800 dark:bg-white/10 dark:text-white">{code}</span>
            <span>Бонус +{bonusDays} дн. после оплаты друга</span>
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:w-[20rem]">
          <button type="button" className="btn-primary" onClick={share}>
            <Send className="h-4 w-4" />
            Поделиться
          </button>
          <button type="button" className="btn-secondary" onClick={() => copy(url)}>
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? 'Готово' : 'Копировать'}
          </button>
        </div>
      </div>
    </div>
  )
}
