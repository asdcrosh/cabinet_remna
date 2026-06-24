'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { CheckCircle2, Loader2, Mail, Send } from 'lucide-react'
import { toast } from '@/components/ui/toaster'

export function TelegramEmailForm({ telegramName, initialEmail }: { telegramName: string | null; initialEmail: string }) {
  const [email, setEmail] = useState(initialEmail.endsWith('@pending.invalid') ? '' : initialEmail)
  const [agreed, setAgreed] = useState(false)
  const [sending, setSending] = useState(false)
  const [sentTo, setSentTo] = useState<string | null>(null)

  useEffect(() => {
    if (!sentTo) return
    let active = true
    const interval = window.setInterval(async () => {
      try {
        const response = await fetch('/api/auth/telegram-miniapp/status', { cache: 'no-store' })
        const data = await response.json().catch(() => null)
        if (active && response.ok && data?.authenticated) {
          window.clearInterval(interval)
          window.location.replace('/dashboard')
        }
      } catch {
        // Keep waiting; the user can also reload manually.
      }
    }, 3000)
    return () => {
      active = false
      window.clearInterval(interval)
    }
  }, [sentTo])

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setSending(true)
    try {
      const response = await fetch('/api/auth/telegram-miniapp/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, agreeToTerms: agreed }),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(data?.error || 'Не удалось отправить письмо')
      setSentTo(data.email)
      toast('Письмо отправлено', 'success')
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Не удалось отправить письмо')
    } finally {
      setSending(false)
    }
  }

  if (sentTo) {
    return (
      <div className="text-center">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-lg bg-emerald-100 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300">
          <CheckCircle2 className="h-7 w-7" />
        </div>
        <h1 className="mt-4 text-xl font-semibold">Проверьте почту</h1>
        <p className="mt-2 text-sm text-slate-500">
          Ссылка отправлена на <span className="font-medium text-slate-800 dark:text-slate-200">{sentTo}</span>
        </p>
        <div className="mt-5 flex items-center justify-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Ожидаем подтверждение
        </div>
        <button type="button" className="btn-secondary mt-5" onClick={() => setSentTo(null)}>
          Изменить email
        </button>
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="flex items-center gap-3 rounded-lg bg-sky-50 px-3 py-3 dark:bg-sky-500/10">
        <Send className="h-5 w-5 text-sky-500" />
        <div className="min-w-0">
          <div className="text-xs text-slate-500">Telegram</div>
          <div className="truncate text-sm font-medium">{telegramName || 'Аккаунт подтверждён'}</div>
        </div>
      </div>
      <label className="block">
        <span className="label">Email</span>
        <div className="relative">
          <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input className="input pl-9" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="email" placeholder="name@example.com" />
        </div>
      </label>
      <label className="flex cursor-pointer items-start gap-3 text-sm text-slate-600 dark:text-slate-300">
        <input className="mt-1" type="checkbox" checked={agreed} onChange={(event) => setAgreed(event.target.checked)} required />
        <span>
          Я принимаю <Link href="/terms" target="_blank" className="text-brand-600 hover:underline">условия использования</Link>
        </span>
      </label>
      <button className="btn-primary w-full" type="submit" disabled={sending}>
        {sending && <Loader2 className="h-4 w-4 animate-spin" />}
        Подтвердить email
      </button>
    </form>
  )
}
