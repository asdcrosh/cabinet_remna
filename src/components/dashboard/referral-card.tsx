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
    <div className="rounded-lg border border-slate-200 bg-white/90 p-4 shadow-sm dark:border-white/10 dark:bg-surface-900/90">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="text-sm font-semibold">Ваша ссылка</div>
          <div className="mt-2 min-w-0 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-sm dark:border-white/10 dark:bg-surface-800">
            <div className="truncate">{url}</div>
          </div>
          <div className="mt-2 text-sm text-slate-500">
            Код <span className="font-mono font-semibold text-slate-900 dark:text-white">{code}</span>
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:w-[23rem]">
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
