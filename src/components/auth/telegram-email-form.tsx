'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { CheckCircle2, Eye, EyeOff, Loader2, LockKeyhole, Mail, Send } from 'lucide-react'
import { toast } from '@/components/ui/toaster'
import { FormAlert } from '@/components/ui/form-alert'

export function TelegramEmailForm({ telegramName, initialEmail }: { telegramName: string | null; initialEmail: string }) {
  const [email, setEmail] = useState(initialEmail.endsWith('@pending.invalid') ? '' : initialEmail)
  const [password, setPassword] = useState('')
  const [passwordConfirmation, setPasswordConfirmation] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showPasswordConfirmation, setShowPasswordConfirmation] = useState(false)
  const [agreed, setAgreed] = useState(false)
  const [personalDataAgreed, setPersonalDataAgreed] = useState(false)
  const [sending, setSending] = useState(false)
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [serverError, setServerError] = useState<string | null>(null)

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
    setServerError(null)
    if (password !== passwordConfirmation) {
      setServerError('Пароли не совпадают')
      return
    }
    setSending(true)
    try {
      const response = await fetch('/api/auth/telegram-miniapp/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          password,
          agreeToTerms: agreed,
          agreeToPersonalData: personalDataAgreed,
        }),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(data?.error || 'Не удалось отправить письмо')
      if (data.authenticated) {
        window.location.replace('/dashboard')
        return
      }
      setSentTo(data.email)
      toast('Письмо отправлено', 'success')
    } catch (error) {
      setServerError(error instanceof Error ? error.message : 'Не удалось отправить письмо')
    } finally {
      setSending(false)
    }
  }

  if (sentTo) {
    return (
      <div className="text-center">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-emerald-100 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300">
          <CheckCircle2 className="h-7 w-7" />
        </div>
        <h2 className="mt-4 text-xl font-semibold">Проверьте почту</h2>
        <p className="mt-2 text-sm text-slate-500">
          Ссылка отправлена на <span className="break-all font-medium text-slate-800 dark:text-slate-200">{sentTo}</span>
        </p>
        <div className="mt-5 flex items-center justify-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Ожидаем подтверждение
        </div>
        <button type="button" className="btn-secondary mt-5 w-full sm:w-auto" onClick={() => setSentTo(null)}>
          Изменить email
        </button>
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="flex items-center gap-3 rounded-2xl border border-sky-100 bg-sky-50 px-3.5 py-3 dark:border-sky-500/20 dark:bg-sky-500/10">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white text-sky-500 shadow-sm dark:bg-white/[0.06] dark:shadow-none">
          <Send className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">Telegram подтверждён</div>
          <div className="truncate text-sm font-semibold text-slate-950 dark:text-white">{telegramName || 'Аккаунт подтверждён'}</div>
        </div>
      </div>
      <label className="block">
        <span className="label">Email</span>
        <div className="relative">
          <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input className="input pl-9" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="email" placeholder="name@example.com" />
        </div>
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="label">Пароль</span>
          <div className="relative">
            <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              className="input px-10"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              maxLength={128}
              autoComplete="new-password"
              placeholder="Введите пароль"
            />
            <button
              type="button"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-xl p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/5 dark:hover:text-slate-200"
              onClick={() => setShowPassword((value) => !value)}
              aria-label={showPassword ? 'Скрыть пароль' : 'Показать пароль'}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </label>
        <label className="block">
          <span className="label">Повторите пароль</span>
          <div className="relative">
            <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              className="input px-10"
              type={showPasswordConfirmation ? 'text' : 'password'}
              value={passwordConfirmation}
              onChange={(event) => setPasswordConfirmation(event.target.value)}
              required
              maxLength={128}
              autoComplete="new-password"
              placeholder="Повторите пароль"
            />
            <button
              type="button"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-xl p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/5 dark:hover:text-slate-200"
              onClick={() => setShowPasswordConfirmation((value) => !value)}
              aria-label={showPasswordConfirmation ? 'Скрыть подтверждение пароля' : 'Показать подтверждение пароля'}
            >
              {showPasswordConfirmation ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </label>
      </div>
      <p className="-mt-2 text-xs leading-5 text-slate-500 dark:text-slate-400">Если этот email уже связан с кабинетом, используйте пароль от него.</p>
      <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-3.5 dark:border-white/[0.08] dark:bg-white/[0.025]">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Документы</div>
        <label className="flex cursor-pointer items-start gap-3 text-sm leading-5 text-slate-600 dark:text-slate-300">
          <input className="mt-0.5 h-4 w-4 shrink-0" type="checkbox" checked={agreed} onChange={(event) => setAgreed(event.target.checked)} required />
          <span>
            Я принимаю <Link href="/terms" target="_blank" className="text-brand-600 hover:underline">условия использования</Link>
          </span>
        </label>
        <label className="flex cursor-pointer items-start gap-3 text-sm leading-5 text-slate-600 dark:text-slate-300">
          <input
            className="mt-0.5 h-4 w-4 shrink-0"
            type="checkbox"
            checked={personalDataAgreed}
            onChange={(event) => setPersonalDataAgreed(event.target.checked)}
            required
          />
          <span>
            Даю отдельное <Link href="/consent" target="_blank" className="text-brand-600 hover:underline">согласие на обработку персональных данных</Link>
            {' '}и ознакомлен с <Link href="/privacy" target="_blank" className="text-brand-600 hover:underline">политикой</Link>
          </span>
        </label>
      </div>
      {serverError && (
        <FormAlert>{serverError}</FormAlert>
      )}
      <button className="btn-primary min-h-12 w-full" type="submit" disabled={sending}>
        {sending && <Loader2 className="h-4 w-4 animate-spin" />}
        {sending ? 'Отправляем...' : 'Добавить email'}
      </button>
    </form>
  )
}
