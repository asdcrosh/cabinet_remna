'use client'

import { useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { toast } from '@/components/ui/toaster'

export function ReferralLinkCard({ code, url }: { code: string; url: string }) {
  const [copied, setCopied] = useState(false)

  async function copy(value: string) {
    await navigator.clipboard.writeText(value)
    setCopied(true)
    toast('Ссылка скопирована', 'success')
    window.setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="card space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Ваша реферальная ссылка</h2>
        <p className="mt-1 text-sm text-slate-500">Отправьте ссылку человеку, которого хотите пригласить.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
        <div className="min-w-0 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-sm dark:border-white/10 dark:bg-surface-800">
          <div className="truncate">{url}</div>
        </div>
        <button type="button" className="btn-primary" onClick={() => copy(url)}>
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          {copied ? 'Готово' : 'Копировать'}
        </button>
      </div>
      <div className="text-sm text-slate-500">Код: <span className="font-mono font-semibold text-slate-900 dark:text-white">{code}</span></div>
    </div>
  )
}
